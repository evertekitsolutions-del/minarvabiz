import assert from 'node:assert/strict';
import { approvedAnnualPlans, quoteReferralCommission } from '../partner-referral-quote.ts';

assert.deepEqual(approvedAnnualPlans.map(p => [p.name, p.pricePaise]), [
  ['Starter', 229900],
  ['Business Pro', 449900],
  ['Business Web', 669900],
  ['Business 360', 889900],
]);
for (const [paidExGstPaise, expected] of [[229900,22990],[449900,44990],[669900,66990],[889900,88990]]) {
  const quote=quoteReferralCommission({paidExGstPaise, isFirstSubscription:true});
  assert.equal(quote.eligibleBasePaise, paidExGstPaise);
  assert.equal(quote.estimatedCommissionPaise, expected);
}
assert.equal(quoteReferralCommission({paidExGstPaise:100000, gatewayFeePaise:2000, refundedExGstPaise:50000, isFirstSubscription:true}).estimatedCommissionPaise,4800);
assert.equal(quoteReferralCommission({paidExGstPaise:100000, chargebackExGstPaise:120000, isFirstSubscription:true}).estimatedCommissionPaise,0);
assert.equal(quoteReferralCommission({paidExGstPaise:889900, isFirstSubscription:false}).estimatedCommissionPaise,0);
assert.equal(quoteReferralCommission({paidExGstPaise:9, isFirstSubscription:true}).estimatedCommissionPaise,1);
assert.equal(quoteReferralCommission({paidExGstPaise:4, isFirstSubscription:true}).estimatedCommissionPaise,0);
for(const bad of [-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]){
 assert.throws(()=>quoteReferralCommission({paidExGstPaise:bad,isFirstSubscription:true}),/safe nonnegative paise integers/);
}
assert.throws(()=>quoteReferralCommission({paidExGstPaise:1200,gatewayFeePaise:-3,isFirstSubscription:true}),/safe nonnegative paise integers/);
assert.throws(()=>quoteReferralCommission({paidExGstPaise:1200,isFirstSubscription:'yes'}),/boolean/);
console.log('Partner referral quote math PASS: price list, GST-exclusive base, fees, refunds, renewals, rounding, invalid inputs');
