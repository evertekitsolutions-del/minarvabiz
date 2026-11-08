#!/usr/bin/env node
/** Original read-only Bigcapital API client. No source copied from Bigcapital. */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseBigcapitalCatalog } from '../packages/business-logic/src/bigcapital-journal-preview.ts';
export async function readBigcapitalCatalog({origin,organizationId,apiKey}, fetchImpl=globalThis.fetch) {
  let url;
  try { url=new URL(origin); } catch { throw Error('BIGCAPITAL_ORIGIN must be an HTTPS origin'); }
  if(url.origin!==origin||url.protocol!=='https:'||url.username||url.password)throw Error('BIGCAPITAL_ORIGIN must be an HTTPS origin without path or credentials');
  if(typeof apiKey!=='string'||!/^bc_[A-Za-z0-9_-]{12,}$/.test(apiKey))throw Error('Set BIGCAPITAL_API_KEY to a Bigcapital API key');
  if(typeof organizationId!=='string'||! /^[\w-]{1,100}$/.test(organizationId))throw Error('Set BIGCAPITAL_ORGANIZATION_ID explicitly');
  async function get(path) {
    let response;
    try { response=await fetchImpl(origin+path,{method:'GET',headers:{Authorization:`Bearer ${apiKey}`,'organization-id':organizationId,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)}); }
    catch { throw Error('Bigcapital GET failed (network, timeout or redirect). Credentials and response body omitted.'); }
    if(!response.ok)throw Error(`Bigcapital GET rejected: HTTP ${response.status}`);
    if(!response.headers.get('content-type')?.includes('application/json'))throw Error('Bigcapital did not return JSON');
    const reader=response.body?.getReader();if(!reader)throw Error('Empty Bigcapital response');
    let bytes=0;const chunks=[];
    try { for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>2_000_000)throw Error('Bigcapital response exceeds 2 MB');chunks.push(value);} }
    catch(e) {await reader.cancel().catch(()=>{});throw Error(e.message==='Bigcapital response exceeds 2 MB'?e.message:'Bigcapital response read failed');}
    finally {reader.releaseLock();}
    try {return JSON.parse(Buffer.concat(chunks).toString('utf8'));} catch {throw Error('Invalid Bigcapital JSON');}
  }
  // API-key authority comes from the key, not the organization-id request header.
  const organization=await get('/api/organization/current');
  if(organization.organization_id!==organizationId)throw Error('API key belongs to a different organization; account read cancelled');
  const result=await get('/api/accounts?structure=flat');
  const branches=await get('/api/branches');
  if(!Array.isArray(result.accounts)||!Array.isArray(branches))throw Error('Unsupported Bigcapital account/branch response');
  return parseBigcapitalCatalog({schema:'minarva.bigcapital.accounts.v1',origin,organizationId,baseCurrency:organization.metadata?.base_currency,
    branches:branches.map(b=>({id:b.id,name:b.name})),accounts:result.accounts.map(a=>({id:a.id,code:a.code??'',name:a.name,active:a.active,currency:a.currency_code??null}))});
}
export async function main(args=process.argv.slice(2),env=process.env) {
  if(args.length!==2||args[0]!=='catalog')throw Error('Usage: node --experimental-strip-types scripts/bigcapital-readonly.mjs catalog OUTPUT.json');
  const catalog=await readBigcapitalCatalog({origin:env.BIGCAPITAL_ORIGIN,organizationId:env.BIGCAPITAL_ORGANIZATION_ID,apiKey:env.BIGCAPITAL_API_KEY});
  await writeFile(args[1],JSON.stringify(catalog,null,2)+'\n',{flag:'wx',mode:0o600});
  return `Saved ${catalog.accounts.length} accounts and ${catalog.branches.length} branches. No Bigcapital records changed.`;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  main().then(message=>console.log(message)).catch(error=>{console.error(error.code==='EEXIST'?'Output already exists; choose a new filename.':error.code?'Unable to write output file.':error.message);process.exitCode=1;});
}
