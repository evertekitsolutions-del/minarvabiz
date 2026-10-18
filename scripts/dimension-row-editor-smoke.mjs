import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(new URL('../packages/ui/package.json', import.meta.url));
const ts = require('typescript');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
const source = await readFile(new URL('../packages/ui/src/components/sales/DimensionRowEditor.tsx',import.meta.url),'utf8');
const compiled = ts.transpileModule(source, {compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
 .replace('"react"',JSON.stringify(pathToFileURL(require.resolve('react')).href))
 .replace('"@minarvabiz/business-logic"',JSON.stringify(new URL('../packages/business-logic/src/dimensional-billing.ts',import.meta.url).href));
const {DimensionRowEditor} = await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const value={length:'12',width:'18',lengthUnit:'in',widthUnit:'in',billableUnit:'sqft',pieces:'2'};
const render=(extra={})=>renderToStaticMarkup(React.createElement(DimensionRowEditor,{value,onChange(){},onApply(){},...extra}));
test('valid dimension row exposes labeled controlled fields and exact quantity',()=>{
 const html=render();
 assert.match(html,/Length/);assert.match(html,/Width/);assert.match(html,/Pieces/);
 assert.match(html,/3 sqft/);assert.match(html,/Apply quantity/);
 assert.doesNotMatch(html,/<button[^>]* disabled=""/);
 assert.equal((html.match(/type="number"/g)||[]).length,0);
 const ids=[...html.matchAll(/ id="([^"]+)"/g)].map(m=>m[1]);
 for(const id of ids.filter(id=>!id.endsWith('-error')))assert.ok(html.includes(`for="${id}"`));
});
test('invalid edit removes quantity, announces error and disables apply',()=>{
 const html=render({value:{...value,length:''}});
 assert.match(html,/role="alert"/);assert.match(html,/<button[^>]* disabled=""/);
 assert.doesNotMatch(html,/3 sqft/);
});
test('read-only row disables controls and cannot apply a valid preview',()=>{
 const html=render({disabled:true});
 assert.match(html,/<fieldset[^>]* disabled=""/);assert.match(html,/<button[^>]* disabled=""/);
});
