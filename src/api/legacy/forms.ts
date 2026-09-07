import { GlpiClient } from './glpi-client.js';
import { FormService } from '../../core/forms/service.js';
import { FormListRequest, FormReviewRequest, FormTextEntry } from '../../core/forms/types.js';

export const FORM_ITEMTYPES = {
  form: 'Glpi\\Form\\Form',
  category: 'Glpi\\Form\\Category',
  section: 'Glpi\\Form\\Section',
  question: 'Glpi\\Form\\Question',
  comment: 'Glpi\\Form\\Comment',
  destination: 'Glpi\\Form\\Destination\\FormDestination',
  accessControl: 'Glpi\\Form\\AccessControl\\FormAccessControl',
  translation: 'Glpi\\Form\\FormTranslation',
} as const;

type Row = Record<string, unknown> & { id?: unknown };

function integer(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function flag(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

function decodeJson(value: unknown): unknown {
  if (typeof value !== 'string' || value.trim() === '') return value ?? null;
  try { return JSON.parse(value); } catch { return value; }
}

function textFromHtml(value: unknown): string {
  if (typeof value !== 'string') return '';
  const namedEntities: Record<string, string> = {
    nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
    agrave: 'à', acirc: 'â', auml: 'ä', ccedil: 'ç', eacute: 'é', egrave: 'è',
    ecirc: 'ê', euml: 'ë', icirc: 'î', iuml: 'ï', ocirc: 'ô', ouml: 'ö',
    ugrave: 'ù', ucirc: 'û', uuml: 'ü', yuml: 'ÿ', oelig: 'œ', laquo: '«', raquo: '»',
  };
  return value
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&([a-z]+);/gi, (entity, name) => namedEntities[String(name).toLowerCase()] ?? entity)
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalize(row: Row): Row {
  const result = { ...row };
  for (const field of ['conditions', 'validation_conditions', 'extra_data', 'default_value', 'config', 'translations']) {
    if (field in result) result[field] = decodeJson(result[field]);
  }
  return redactSecrets(result) as Row;
}

function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [
    key,
    /token|password|secret|community/i.test(key) ? '[REDACTED]' : redactSecrets(child),
  ]));
}

function rank(row: Row): [number, number, number] {
  return [Number(row.rank ?? 0), Number(row.vertical_rank ?? 0), Number(row.horizontal_rank ?? -1)];
}

function compareRank(a: Row, b: Row): number {
  const ar = rank(a); const br = rank(b);
  return ar[0] - br[0] || ar[1] - br[1] || ar[2] - br[2] || Number(a.id) - Number(b.id);
}

function addText(entries: FormTextEntry[], path: string, objectType: FormTextEntry['objectType'], objectId: number, field: string, value: unknown) {
  if (typeof value !== 'string' || value.trim() === '') return;
  entries.push({ path, objectType, objectId, field, html: /<[^>]+>/.test(value) ? value : null, text: textFromHtml(value) });
}

export class LegacyFormService implements FormService {
  constructor(private readonly client: GlpiClient) {}

  private async all(itemtype: string): Promise<Row[]> {
    return this.client.getItems<Row>(itemtype, { range: '0-9999', expand_dropdowns: false });
  }

  async listForms(input: FormListRequest): Promise<Row[]> {
    const rows = await this.all(FORM_ITEMTYPES.form);
    const filtered = rows.filter((row) =>
      (input.activeOnly === false || flag(row.is_active)) &&
      (input.includeDrafts === true || !flag(row.is_draft))
    );
    const start = input.start ?? 0;
    return filtered.slice(start, start + (input.limit ?? 50)).map(normalize);
  }

  async listCategories(input: FormListRequest): Promise<Row[]> {
    const rows = (await this.all(FORM_ITEMTYPES.category)).sort((a, b) =>
      String(a.completename ?? a.name ?? '').localeCompare(String(b.completename ?? b.name ?? ''))
    );
    const start = input.start ?? 0;
    return rows.slice(start, start + (input.limit ?? 50)).map(normalize);
  }

  async getForm(id: number): Promise<unknown> {
    const form = normalize(await this.client.getItem<Row>(FORM_ITEMTYPES.form, id, { expand_dropdowns: false }));
    const [allSections, allQuestions, allComments, allDestinations, allAccessControls, allTranslations] = await Promise.all([
      this.all(FORM_ITEMTYPES.section), this.all(FORM_ITEMTYPES.question), this.all(FORM_ITEMTYPES.comment),
      this.all(FORM_ITEMTYPES.destination), this.all(FORM_ITEMTYPES.accessControl), this.all(FORM_ITEMTYPES.translation),
    ]);
    const sections = allSections.filter((row) => integer(row.forms_forms_id) === id).sort(compareRank);
    const sectionIds = new Set(sections.map((row) => integer(row.id)).filter((value): value is number => value !== null));
    const questions = allQuestions.filter((row) => sectionIds.has(integer(row.forms_sections_id) ?? -1));
    const comments = allComments.filter((row) => sectionIds.has(integer(row.forms_sections_id) ?? -1));

    return {
      ...form,
      sections: sections.map((section) => {
        const sectionId = integer(section.id)!;
        const blocks = [
          ...questions.filter((row) => integer(row.forms_sections_id) === sectionId).map((row) => ({ ...normalize(row), block_type: 'question' })),
          ...comments.filter((row) => integer(row.forms_sections_id) === sectionId).map((row) => ({ ...normalize(row), block_type: 'comment' })),
        ].sort(compareRank);
        return {
          ...normalize(section),
          translations: allTranslations.filter((row) => row.itemtype === FORM_ITEMTYPES.section && integer(row.items_id) === sectionId).map(normalize),
          blocks: blocks.map((block) => ({
            ...block,
            translations: allTranslations.filter((row) =>
              row.itemtype === (block.block_type === 'comment' ? FORM_ITEMTYPES.comment : FORM_ITEMTYPES.question) &&
              integer(row.items_id) === integer(block.id)
            ).map(normalize),
          })),
        };
      }),
      destinations: allDestinations.filter((row) => integer(row.forms_forms_id) === id).map(normalize),
      access_controls: allAccessControls.filter((row) => integer(row.forms_forms_id) === id).map(normalize),
      translations: allTranslations.filter((row) => row.itemtype === FORM_ITEMTYPES.form && integer(row.items_id) === id).map(normalize),
    };
  }

  private addNestedText(entries: FormTextEntry[], path: string, objectType: FormTextEntry['objectType'], objectId: number, field: string, value: unknown) {
    if (typeof value === 'string') {
      if (value === '[REDACTED]') return;
      addText(entries, path, objectType, objectId, field, value);
    } else if (Array.isArray(value)) {
      value.forEach((child, index) => this.addNestedText(entries, `${path} > ${index}`, objectType, objectId, `${field}.${index}`, child));
    } else if (value && typeof value === 'object') {
      Object.entries(value).forEach(([key, child]) =>
        this.addNestedText(entries, `${path} > ${key}`, objectType, objectId, `${field}.${key}`, child));
    }
  }

  private proofreadingView(form: any): { form_id: number; form_name: string; entries: FormTextEntry[] } {
    const formId = integer(form.id)!;
    const formName = String(form.name ?? `Form ${formId}`);
    const entries: FormTextEntry[] = [];
    addText(entries, formName, 'form', formId, 'name', form.name);
    addText(entries, formName, 'form', formId, 'header', form.header);
    addText(entries, formName, 'form', formId, 'description', form.description);
    for (const translation of form.translations ?? []) {
      this.addNestedText(entries, `${formName} > translation ${translation.language ?? translation.id}`, 'form', formId, 'translation', translation.translations);
    }
    for (const section of form.sections ?? []) {
      const sectionId = integer(section.id)!;
      const sectionName = String(section.name ?? `Section ${sectionId}`);
      const sectionPath = `${formName} > ${sectionName}`;
      addText(entries, sectionPath, 'section', sectionId, 'name', section.name);
      addText(entries, sectionPath, 'section', sectionId, 'description', section.description);
      for (const translation of section.translations ?? []) {
        this.addNestedText(entries, `${sectionPath} > translation ${translation.language ?? translation.id}`, 'section', sectionId, 'translation', translation.translations);
      }
      for (const block of section.blocks ?? []) {
        const blockId = integer(block.id)!;
        const objectType = block.block_type === 'comment' ? 'comment' : 'question';
        const blockName = String(block.name ?? `${objectType} ${blockId}`);
        const blockPath = `${sectionPath} > ${blockName}`;
        addText(entries, blockPath, objectType, blockId, 'name', block.name);
        addText(entries, blockPath, objectType, blockId, 'description', block.description);
        for (const translation of block.translations ?? []) {
          this.addNestedText(entries, `${blockPath} > translation ${translation.language ?? translation.id}`, objectType, blockId, 'translation', translation.translations);
        }
        const options = block.extra_data && typeof block.extra_data === 'object'
          ? (block.extra_data as any).options : null;
        if (options && typeof options === 'object') {
          for (const [key, value] of Object.entries(options)) {
            addText(entries, `${blockPath} > option ${key}`, 'option', blockId, `extra_data.options.${key}`, value);
          }
        }
      }
    }
    for (const destination of form.destinations ?? []) {
      const destinationId = integer(destination.id)!;
      const path = `${formName} > destination ${destination.name ?? destinationId}`;
      addText(entries, path, 'form', formId, `destination.${destinationId}.name`, destination.name);
      this.addNestedText(entries, path, 'form', formId, `destination.${destinationId}.config`, destination.config);
    }
    return { form_id: formId, form_name: formName, entries };
  }

  async reviewForms(input: FormReviewRequest): Promise<unknown> {
    const ids = input.formIds?.length
      ? [...new Set(input.formIds)]
      : (await this.listForms({ activeOnly: input.activeOnly, includeDrafts: input.includeDrafts, limit: input.limit ?? 100 }))
          .map((row) => integer(row.id)).filter((id): id is number => id !== null);
    const forms = [];
    for (const id of ids.slice(0, input.limit ?? 100)) forms.push(this.proofreadingView(await this.getForm(id)));
    return { form_count: forms.length, text_entry_count: forms.reduce((sum, form) => sum + form.entries.length, 0), forms };
  }
}
