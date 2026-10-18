import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('typescript');
require.extensions['.ts']=(mod,filename)=>mod._compile(
  ts.transpileModule(fs.readFileSync(filename,'utf8'),{
    fileName:filename,compilerOptions:{
      module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,
      inlineSourceMap:true,inlineSources:true,
    },
  }).outputText,filename
);
const {createSupabaseCloudAdapter}=require('../supabase-adapter.ts');

const dimension={
  schema:'dimension-line-v1',algorithm:'area-v1',length:'12',width:'18',
  lengthUnit:'in',widthUnit:'in',billableUnit:'sqft',pieces:2,quantityMilli:3000,
};
const saleId='sale-dimension-1';
const event=(id,type,payload)=>({
  id,aggregateType:type,aggregateId:type==='sales'?saleId:id,eventType:'insert',
  payload,occurredAt:'2026-10-18T00:00:00Z',sequence:1,deviceId:'device-1',
});

test('remote financial replay rejects dimensional sale and linked payment without any DML',async()=>{
  const writes=[];
  const client={
    insert:async(table,row)=>{writes.push(['insert',table,row]);return {error:null};},
    update:async(table,match,patch)=>{writes.push(['update',table]);return {error:null};},
    select:async()=>({data:[],error:null}),
  };
  const adapter=createSupabaseCloudAdapter(client,'device-1');
  const sale=event('sale-event','sales',{id:saleId,items:[{
    id:'line-1',quantity:3,dimensionMetadata:dimension,
  }]});
  const payment=event('payment-event','payments',{id:'payment-1',referenceType:'sale',referenceId:saleId,amount:300});
  // The payment precedes its parent sale. The whole group must stay unacknowledged.
  const result=await adapter.push([payment,sale]);
  assert.deepEqual(result.accepted,[]);
  assert.deepEqual(result.rejected.map(x=>x.id),['payment-event','sale-event']);
  assert.ok(result.rejected.every(x=>/dimension.*atomic/i.test(x.error)));
  assert.deepEqual(writes,[],'no table writes, payment posting, or false outbox acknowledgement');
});

test('both JSON-encoded and snake_case audit input are blocked at financial replay',async()=>{
  let wrote=0;
  const client={
    insert:async()=>{wrote++;return {error:null};},
    update:async()=>{wrote++;return {error:null};},
    select:async()=>({data:[],error:null}),
  };
  const adapter=createSupabaseCloudAdapter(client,'device-1');
  const sale=event('sale-event','sales',JSON.stringify({id:saleId,items:[{
    id:'item-1',dimension_metadata:dimension,quantity:3,
  }]}));
  const result=await adapter.push([sale]);
  assert.deepEqual(result.accepted,[]);
  assert.deepEqual(result.rejected.map(x=>x.id),['sale-event']);
  assert.equal(wrote,0);
});
