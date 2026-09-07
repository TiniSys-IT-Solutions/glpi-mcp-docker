import test from 'node:test';
import assert from 'node:assert/strict';
import { LegacyFormService, FORM_ITEMTYPES } from '../src/api/legacy/forms.js';
import { HighLevelFormService } from '../src/api/highlevel/forms.js';

const rows: Record<string, any[]> = {
  [FORM_ITEMTYPES.form]: [
    { id: 1, name: 'Request access', header: '<p>Please describe your r&eacute;quest.</p>', description: 'Access request', is_active: 1, is_draft: 0 },
    { id: 2, name: 'Draft', is_active: 0, is_draft: 1 },
  ],
  [FORM_ITEMTYPES.category]: [{ id: 3, name: 'IT services', completename: 'Services > IT', description: '<p>IT requests</p>' }],
  [FORM_ITEMTYPES.section]: [{ id: 10, forms_forms_id: 1, name: 'Identity', description: 'About you', rank: 0 }],
  [FORM_ITEMTYPES.question]: [{
    id: 20, forms_sections_id: 10, name: 'Which application?', description: '<b>Choose one</b>',
    type: 'Glpi\\Form\\QuestionType\\QuestionTypeRadio', vertical_rank: 1, horizontal_rank: null,
    extra_data: JSON.stringify({ options: { a: 'Application A', b: 'Application B' } }), conditions: '[]',
  }],
  [FORM_ITEMTYPES.comment]: [{ id: 30, forms_sections_id: 10, name: 'Important', description: '<p>Manager approval is required.</p>', vertical_rank: 0 }],
  [FORM_ITEMTYPES.destination]: [{ id: 40, forms_forms_id: 1, name: 'Ticket', config: JSON.stringify({ title: 'New access request' }) }],
  [FORM_ITEMTYPES.accessControl]: [{ id: 50, forms_forms_id: 1, strategy: 'DirectAccess', config: JSON.stringify({ token: 'must-not-leak', allow_unauthenticated: false }) }],
  [FORM_ITEMTYPES.translation]: [{ id: 60, itemtype: FORM_ITEMTYPES.question, items_id: 20, language: 'fr_FR', translations: JSON.stringify({ question_name: 'Quelle application ?' }) }],
};

function client() {
  return {
    async getItems(itemtype: string) { return rows[itemtype] ?? []; },
    async getItem(itemtype: string, id: number) {
      const item = (rows[itemtype] ?? []).find((row) => row.id === id);
      if (!item) throw new Error('not found');
      return item;
    },
  } as any;
}

test('native form list excludes inactive drafts by default and lists catalog categories', async () => {
  const service = new LegacyFormService(client());
  assert.deepEqual((await service.listForms({})) as any[], [rows[FORM_ITEMTYPES.form][0]]);
  assert.equal(((await service.listCategories({})) as any[])[0].completename, 'Services > IT');
});

test('complete native form read orders mixed comments and questions and decodes JSON fields', async () => {
  const form: any = await new LegacyFormService(client()).getForm(1);
  assert.equal(form.sections.length, 1);
  assert.deepEqual(form.sections[0].blocks.map((block: any) => block.block_type), ['comment', 'question']);
  assert.deepEqual(form.sections[0].blocks[1].extra_data.options, { a: 'Application A', b: 'Application B' });
  assert.deepEqual(form.sections[0].blocks[1].conditions, []);
  assert.equal(form.destinations[0].config.title, 'New access request');
  assert.equal(form.access_controls[0].config.token, '[REDACTED]');
  assert.equal(form.sections[0].blocks[1].translations[0].translations.question_name, 'Quelle application ?');
});

test('proofreading view returns located plain text while preserving original rich HTML', async () => {
  const result: any = await new LegacyFormService(client()).reviewForms({ formIds: [1] });
  assert.equal(result.form_count, 1);
  assert.ok(result.forms[0].entries.some((entry: any) =>
    entry.field === 'description' && entry.text === 'Choose one' && entry.html === '<b>Choose one</b>'
  ));
  assert.ok(result.forms[0].entries.some((entry: any) => entry.field === 'header' && entry.text.includes('réquest')));
  assert.ok(result.forms[0].entries.some((entry: any) =>
    entry.objectType === 'option' && entry.path.includes('Which application?') && entry.text === 'Application B'
  ));
  assert.ok(result.forms[0].entries.some((entry: any) => entry.text === 'New access request'));
  assert.ok(result.forms[0].entries.some((entry: any) => entry.text === 'Quelle application ?'));
  assert.ok(!JSON.stringify(result).includes('must-not-leak'));
});

test('High-Level form reads fail explicitly until Swagger routes are confirmed', async () => {
  const service = new HighLevelFormService();
  await assert.rejects(() => service.getForm(1), /glpi_get_form/);
  await assert.rejects(() => service.reviewForms({}), /glpi_review_forms/);
});
