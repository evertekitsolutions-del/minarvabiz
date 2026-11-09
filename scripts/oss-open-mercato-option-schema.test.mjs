import test from 'node:test';
import assert from 'node:assert/strict';
import { expandOptionSchemaTranslationFields } from '../packages/business-logic/src/donors/open-mercato/optionSchemaTranslations.ts';
test('MIT donor option matrix translation keeps unique brand, fabric, color and size choice keys', () => {
  const schema = {schema:{options:[
    {code:'brand',label:'Brand',choices:[{code:'nike',label:'Nike'}]},
    {code:'fabric',label:'Fabric',choices:[{code:'cotton',label:'Cotton'}]},
    {code:'color',label:'Color',choices:[{code:'red',label:'Red'}]},
    {code:'size',label:'Size',choices:[{code:'S',label:'Small'},{code:'XL',label:'Extra Large'}]},
    {code:'size',label:'Duplicate',choices:[{code:'S',label:'Duplicate'}]}
  ]}};
  const fields=expandOptionSchemaTranslationFields(schema);
  assert.equal(new Set(fields.map(x=>x.key)).size,fields.length);
  assert.ok(fields.some(x=>x.key==='options.brand.choices.nike.label'));
  assert.ok(fields.some(x=>x.key==='options.fabric.choices.cotton.label'));
  assert.ok(fields.some(x=>x.key==='options.color.choices.red.label'));
  assert.ok(fields.some(x=>x.key==='options.size.choices.XL.label'));
  assert.equal(fields.filter(x=>x.key==='options.size.label').length,1);
});
