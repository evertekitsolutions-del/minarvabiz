let failed=0;
function assert(c,m){if(!c){console.error("FAIL:",m);failed++;}else console.log("OK:",m);}
function round(n){return Math.round((n+Number.EPSILON)*1000)/1000;}
const productTotal=100;
let binA={quantity:60,reserved:0};
let binB={quantity:20,reserved:0};
const allocated=()=>round(binA.quantity+binB.quantity);
const unallocated=()=>round(productTotal-allocated());
assert(unallocated()===20,"unallocated stock equals product total minus bin allocations");
const qty=15;
assert(qty<=binA.quantity-binA.reserved,"transfer request fits available source bin stock");
binA.reserved=round(binA.reserved+qty);
assert(binA.reserved===15,"request reserves source stock");
const productTotalBefore=productTotal;
binA.quantity=round(binA.quantity-qty);
binA.reserved=round(binA.reserved-qty);
binB.quantity=round(binB.quantity+qty);
assert(binA.quantity===45&&binB.quantity===35,"completed transfer moves bin stock");
assert(allocated()===80,"allocated total preserved by bin transfer");
assert(productTotal===productTotalBefore,"bin transfer does not change accounting product stock");
assert(binA.reserved===0,"completion releases reservation");
if(failed)process.exit(1);
console.log("warehouse WMS invariants passed");
