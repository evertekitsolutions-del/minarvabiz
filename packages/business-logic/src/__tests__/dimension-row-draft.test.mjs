import test from 'node:test';
import assert from 'node:assert/strict';
import * as editor from '../dimensional-billing.ts';
const draft = {length:'12',width:'18',lengthUnit:'in',widthUnit:'in',billableUnit:'sqft',pieces:'2'};
test('dimensional editor returns exact quantity and immutable audit snapshot',()=>{
 assert.equal(typeof editor.previewDimensionRow,'function');
 const input=structuredClone(draft);
 const result=editor.previewDimensionRow(input);
 assert.deepEqual(result,{valid:true,measurement:{...draft,pieces:2,algorithm:'area-v1',quantityMilli:3000,quantity:3}});
 assert.ok(Object.isFrozen(result));assert.ok(Object.isFrozen(result.measurement));
 assert.deepEqual(input,draft);
});
test('invalid input clears previous quantity instead of retaining a stale billable value',()=>{
 for(const patch of [{length:''},{width:'-1'},{pieces:''},{pieces:'1.5'},{pieces:'1e2'},{pieces:'1000001'},{lengthUnit:'__proto__'},{billableUnit:'acre'},{pieces:null}]){
  const result=editor.previewDimensionRow({...draft,...patch});
  assert.equal(result.valid,false,JSON.stringify(patch));
  assert.equal(result.measurement,undefined);assert.equal(typeof result.error,'string');
 }
});
test('mixed units, half-up rounding and below-minimum area use shared calculator rules',()=>{
 assert.equal(editor.previewDimensionRow({...draft,length:'1',width:'100',lengthUnit:'m',widthUnit:'cm',billableUnit:'sqm',pieces:'1'}).measurement.quantityMilli,1000);
 assert.equal(editor.previewDimensionRow({...draft,length:'0.0015',width:'1',lengthUnit:'m',widthUnit:'m',billableUnit:'sqm',pieces:'1'}).measurement.quantityMilli,2);
 assert.equal(editor.previewDimensionRow({...draft,length:'0.000001',width:'0.000001',lengthUnit:'mm',widthUnit:'mm'}).valid,false);
});
