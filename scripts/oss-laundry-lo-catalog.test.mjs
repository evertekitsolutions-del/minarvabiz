import test from 'node:test';
import assert from 'node:assert/strict';
import { toCatalog } from '../packages/business-logic/src/donors/laundry-lo/catalog.ts';
test('MIT Laundry Lo garment-wise service rate cards preserve minor-unit prices and empty categories', () => {
 const base={category_id:'wash', service:'wash-iron', category_name:'Wash & Iron', item_id:'shirt',
 item_name:'Shirt',description:null,price:5500,currency:'INR',unit:'piece',icon_key:null};
 const c=toCatalog([base,{...base,item_id:'trousers',item_name:'Trousers',price:7500},
 {...base,category_id:'dry',service:'dry-cleaning',category_name:'Dry Clean',item_id:null}]);
 assert.equal(c.length,2);
 assert.equal(c[0].items.length,2);
 assert.deepEqual(c[0].items[0].price,{amount:5500,currency:'INR'});
 assert.equal(c[1].items.length,0);
});
