import { parse, type DefaultTreeAdapterMap } from 'parse5';
import { CookieJar } from 'tough-cookie';
import { isIP } from 'node:net';
import type { GlpiHttpConfig } from './http.js';

type Node = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];
const TYPE = 'GlpiPlugin\\Addressing\\Addressing';
const MAX_BODY = 4 * 1024 * 1024;
const attr = (element: Element, name: string) => element.attrs.find(a => a.name === name)?.value;
function elements(root: Node, predicate: (element: Element) => boolean): Element[] {
  const result: Element[] = [];
  const visit = (node: Node) => {
    if ('tagName' in node && predicate(node)) result.push(node);
    if ('childNodes' in node) node.childNodes.forEach(visit);
  };
  visit(root);
  return result;
}
function text(node: Node): string {
  return 'value' in node ? node.value : 'childNodes' in node ? node.childNodes.map(text).join('') : '';
}
function unique<T>(values: T[], message: string): T {
  if (values.length !== 1) throw new Error(message);
  return values[0];
}
function ipNumber(ip: string) { return ip.split('.').reduce((a, b) => a * 256 + Number(b), 0); }
export interface NativeReportRow {
  ip: string;
  comment: string;
  ping_state: 'ok' | 'ko' | 'unknown';
  ping_date: string | null;
  has_linked_equipment: boolean;
}
interface NativePage { rows: NativeReportRow[]; commentUrl: string; csrf: string; }

/** GLPI 11 native web session, isolated per MCP operation. No cookies on disk,
 * API-session conversion, error fallback, JavaScript execution or ping requests.
 */
export class AddressingWebSession {
  private readonly jar = new CookieJar();
  private readonly base: URL;
  private ajaxCsrf = '';
  constructor(private readonly config: GlpiHttpConfig) {
    this.base = new URL(config.url.replace(/\/$/, '') + '/');
    if (!['http:', 'https:'].includes(this.base.protocol) || this.base.username || this.base.password || this.base.search || this.base.hash) {
      throw new Error('Native Addressing requires a credential-free GLPI base URL');
    }
  }

  private url(path: string): URL {
    const url = new URL(path, this.base);
    if (url.origin !== this.base.origin || !url.pathname.startsWith(this.base.pathname) || url.username || url.password || url.hash
      || [...url.searchParams.keys()].some(key => /token|password|cookie|secret/i.test(key))) {
      throw new Error('Native Addressing refused a redirect or route outside the configured GLPI installation');
    }
    return url;
  }

  private async request(path: string, fields?: Record<string, string>, ajax = false): Promise<string> {
    let url = this.url(path);
    let body = fields ? new URLSearchParams(fields) : undefined;
    const signal = AbortSignal.timeout(this.config.timeoutMs ?? 15000);
    for (let redirects = 0; redirects <= 5; redirects++) {
      const headers: Record<string, string> = { Accept: 'text/html, application/json', Cookie: await this.jar.getCookieString(url.href) };
      if (body) headers['Content-Type'] = 'application/x-www-form-urlencoded';
      if (ajax) {
        headers['X-Requested-With'] = 'XMLHttpRequest';
        if (body) headers['X-Glpi-Csrf-Token'] = this.ajaxCsrf;
      }
      let response: Response;
      try { response = await fetch(url, { method: body ? 'POST' : 'GET', headers, body, redirect: 'manual', signal }); }
      catch { throw new Error('Native Addressing request unavailable; a submitted write must not be retried automatically'); }
      for (const cookie of response.headers.getSetCookie()) {
        try { await this.jar.setCookie(cookie, url.href); }
        catch { throw new Error('Native Addressing received an invalid session cookie'); }
      }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location || (body && [307, 308].includes(response.status))) throw new Error('Native Addressing refused an ambiguous POST redirect');
        url = this.url(new URL(location, url).href);
        if (/\/(MFA|Oauth|SAML|CAS)(\/|$)/i.test(url.pathname)) throw new Error('Native GLPI login requires interactive authentication; no MFA or SSO bypass is performed');
        body = undefined;
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Native Addressing request denied or failed (HTTP ${response.status}); no REST fallback is performed`);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Native Addressing returned an empty response');
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > MAX_BODY) { await reader.cancel(); throw new Error('Native Addressing response exceeds the safety limit'); }
          chunks.push(value);
        }
      } catch {
        throw new Error('Native Addressing response unavailable or exceeds the safety limit; verify any submitted write before retrying');
      }
      return Buffer.concat(chunks).toString('utf8');
    }
    throw new Error('Native GLPI login exceeded the redirect limit');
  }

  private csrf(html: string): string {
    const values = elements(parse(html), e => e.tagName === 'meta' && attr(e, 'property') === 'glpi:csrf_token')
      .map(e => attr(e, 'content')).filter((value): value is string => Boolean(value));
    return unique(values, 'Native GLPI session unavailable: missing AJAX CSRF token (login, MFA or unsupported page)');
  }

  async login(userId: number, profileId: number, entityId: number): Promise<void> {
    if (!Number.isSafeInteger(userId) || userId <= 0 || !Number.isSafeInteger(profileId) || profileId <= 0 || !Number.isSafeInteger(entityId) || entityId < 0) throw new Error('Native Addressing needs a valid REST user, profile and range entity');
    const html = await this.request('index.php');
    const form = unique(elements(parse(html), e => e.tagName === 'form' && attr(e, 'action') !== undefined
      && this.url(attr(e, 'action')!).pathname === this.url('front/login.php').pathname), 'Native GLPI login form is unavailable');
    const token = unique(elements(form, e => e.tagName === 'input' && attr(e, 'name') === '_glpi_csrf_token'), 'Native GLPI login CSRF token is missing');
    const csrf = attr(token, 'value');
    if (!csrf) throw new Error('Native GLPI login CSRF token is empty');
    const fields: Record<string, string> = { _glpi_csrf_token: csrf, login_remember: '0' };
    if (this.config.userToken) { fields.user_token = this.config.userToken; fields.noAUTO = '0'; }
    else if (this.config.username && this.config.password) { fields.login_name = this.config.username; fields.login_password = this.config.password; fields.noAUTO = '1'; }
    else throw new Error('Native Addressing requires the configured GLPI user token or username/password');
    this.ajaxCsrf = this.csrf(await this.request('front/login.php', fields));
    // SSO can take priority over personal-token authentication in GLPI. Check
    // the authenticated user's own preference form before accepting that login.
    // This tab always binds its User object to Session::getLoginUserID().
    const identityQuery = new URLSearchParams({ _itemtype: 'Preference', _glpi_tab: 'User$1',
      _target: this.url('front/preference.php').pathname, id: '0' });
    const identity = parse(await this.request(`ajax/common.tabs.php?${identityQuery}`, undefined, true));
    const ownForm = unique(elements(identity, e => e.tagName === 'form' && attr(e, 'id') === 'main-form'
      && attr(e, 'action') !== undefined && this.url(attr(e, 'action')!).pathname === this.url('front/preference.php').pathname),
      'Native GLPI login identity cannot be verified');
    const ownId = unique(elements(ownForm, e => e.tagName === 'input' && attr(e, 'name') === 'id'), 'Native GLPI login identity is ambiguous');
    if (attr(ownId, 'value') !== String(userId)) throw new Error('Native GLPI login resolved to a different user than the REST service account');
    // The new browser session may default to another profile. GLPI validates
    // both selections; only its web-session context is changed, never inventory.
    await this.request('Session/ChangeProfile', { id: String(profileId) }, true);
    this.ajaxCsrf = this.csrf(await this.request('front/central.php'));
    await this.request('Session/ChangeEntity', { id: String(entityId), is_recursive: '0' }, true);
    this.ajaxCsrf = this.csrf(await this.request('front/central.php'));
  }

  async page(rangeId: number, start: number): Promise<NativePage> {
    const query = new URLSearchParams({ _itemtype: TYPE, _glpi_tab: `${TYPE}$0`, _target: this.url('front/central.php').pathname,
      id: String(rangeId), start: String(start), filter: '0', seeallotedip: '1', seedoubleip: '1', seereservedip: '1', seefreeip: '1', ping_on: '1', ping_off: '1' });
    // Use the same tab route as the browser. report.form.php applies its own
    // export/pagination handling; do not guess pagination from that route.
    const html = await this.request(`ajax/common.tabs.php?${query}`, undefined, true);
    const table = unique(elements(parse(html), e => e.tagName === 'table' && attr(e, 'data-addressing-report') !== undefined),
      'Native Addressing report unavailable or incompatible; missing rows are never treated as empty comments');
    if (attr(table, 'data-addressing-id') !== String(rangeId)) throw new Error('Native Addressing returned another range');
    const commentUrl = attr(table, 'data-addressing-comment-url');
    if (!commentUrl) throw new Error('Native Addressing comment route is missing');
    const target = this.url(commentUrl);
    const relativePath = target.pathname.slice(this.base.pathname.length);
    if (!/^(plugins|marketplace)\/addressing\/ajax\/ipcomment\.php$/.test(relativePath) || target.search) throw new Error('Native Addressing refused an unaudited comment route');
    const rows: NativeReportRow[] = [];
    for (const tr of elements(table, e => e.tagName === 'tr')) {
      const inputs = elements(tr, e => e.tagName === 'input' && attr(e, 'data-addressing-comment') !== undefined);
      if (!inputs.length) {
        if (elements(tr, e => e.tagName === 'td').length) throw new Error('Native Addressing report row lacks its comment input');
        continue;
      }
      const input = unique(inputs, 'Native Addressing row contains ambiguous comments');
      const cells = tr.childNodes.filter((node): node is Element => 'tagName' in node && node.tagName === 'td');
      const ip = cells[1] ? text(cells[1]).trim() : '';
      if (isIP(ip) !== 4 || attr(input, 'data-addressing-comment') !== `IP${ipNumber(ip)}` || attr(input, 'value') === undefined) throw new Error('Native Addressing row has an incompatible IP/comment schema');
      const states = elements(tr, e => e.tagName === 'i').map(e => attr(e, 'class')?.split(/\s+/) ?? []).flat();
      const ok = states.includes('plugin_addressing_icon_ok');
      const ko = states.includes('plugin_addressing_icon_ko');
      if (ok && ko) throw new Error('Native Addressing row contains contradictory ping states');
      const ping = elements(tr, e => e.tagName === 'i' && (attr(e, 'class')?.split(/\s+/).includes(ok ? 'plugin_addressing_icon_ok' : 'plugin_addressing_icon_ko') ?? false))[0];
      const title = ping ? attr(ping, 'title') : undefined;
      const rowClass = attr(tr, 'class')?.split(/\s+/) ?? [];
      const row: NativeReportRow = { ip, comment: attr(input, 'value')!, ping_state: ok ? 'ok' : ko ? 'ko' : 'unknown',
        ping_date: title?.includes(' : ') ? title.slice(title.indexOf(' : ') + 3) : null,
        has_linked_equipment: !rowClass.some(c => ['plugin_addressing_ip_free', 'plugin_addressing_ping_on', 'plugin_addressing_ping_off'].includes(c)) };
      const existing = rows.find(r => r.ip === ip);
      if (existing && JSON.stringify(existing) !== JSON.stringify(row)) throw new Error('Native Addressing returned contradictory rows for one IP');
      if (!existing) rows.push(row);
    }
    return { rows, commentUrl: target.href, csrf: this.ajaxCsrf };
  }

  async save(page: NativePage, rangeId: number, ip: string, comment: string): Promise<void> {
    if (!page.rows.some(row => row.ip === ip)) throw new Error('Native Addressing refuses writing an unreadable IP row');
    const result = await this.request(page.commentUrl, { addressing_id: String(rangeId), ipname: `IP${ipNumber(ip)}`, contentC: comment }, true);
    if (result.trim() !== '0') throw new Error('Native Addressing returned an ambiguous write acknowledgement; verify before retrying');
  }

  async close(): Promise<void> { await this.jar.removeAllCookies(); this.ajaxCsrf = ''; }
}
