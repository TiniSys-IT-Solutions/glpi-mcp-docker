const TECHNICAL_IPS = new Set(['192.168.223.1', '156.152.79.229', '156.152.79.233']);

export function selectPrinterBusinessIP(values: string[]):
  { status: 'ok'; ip: string } | { status: 'ambiguous_ip'; candidates: string[] } | { status: 'no_ip'; candidates: string[] } {
  const unique = [...new Set(values.filter(isIPv4))].filter((ip) => !TECHNICAL_IPS.has(ip));
  const business = unique.filter((ip) => ip.startsWith('10.'));
  const candidates = business.length > 0 ? business : unique;
  if (candidates.length === 1) return { status: 'ok', ip: candidates[0] };
  if (candidates.length > 1) return { status: 'ambiguous_ip', candidates };
  return { status: 'no_ip', candidates: [] };
}

export function cidrContainsIPv4(cidr: string, ip: string): boolean {
  const [networkText, prefixText] = cidr.split('/');
  const prefix = Number(prefixText);
  if (!isIPv4(networkText) || !isIPv4(ip) || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  const network = ipv4Number(networkText);
  const address = ipv4Number(ip);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (network & mask) === (address & mask);
}

function ipv4Number(value: string): number {
  return value.split('.').map(Number).reduce((result, octet) => ((result << 8) | octet) >>> 0, 0);
}

function isIPv4(value: string): boolean {
  const parts = value.split('.');
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
