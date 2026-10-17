/**
 * Published annual prices, in integer paise, exclusive of GST.
 * Marketing estimates only: do not use this module to credit or pay partners.
 */
export const approvedAnnualPlans = [
  { name: "Starter", pricePaise: 229900 },
  { name: "Business Pro", pricePaise: 449900 },
  { name: "Business Web", pricePaise: 669900 },
  { name: "Business 360", pricePaise: 889900 },
] as const;

export type ReferralQuoteInput = {
  /** Actual first subscription receipts after discounts, EXCLUDING GST. */
  paidExGstPaise: number;
  /** Actual payment-processing deduction, if any. */
  gatewayFeePaise?: number;
  refundedExGstPaise?: number;
  chargebackExGstPaise?: number;
  isFirstSubscription: boolean;
};

/**
 * Pure, deliberately non-authoritative commission ESTIMATE. Round half-up
 * to the nearest paise. Finance must separately establish attribution,
 * cleared payment, consent, 30-day hold and manual payout approval.
 */
export function quoteReferralCommission(input: ReferralQuoteInput): {
  eligibleBasePaise: number;
  estimatedCommissionPaise: number;
  ratePercent: 10;
} {
  const { paidExGstPaise, gatewayFeePaise = 0, refundedExGstPaise = 0,
    chargebackExGstPaise = 0, isFirstSubscription } = input;
  for (const value of [paidExGstPaise, gatewayFeePaise, refundedExGstPaise, chargebackExGstPaise]) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError("Amounts must be safe nonnegative paise integers");
    }
  }
  if (typeof isFirstSubscription !== "boolean") {
    throw new TypeError("isFirstSubscription must be a boolean");
  }
  const balance = BigInt(paidExGstPaise) - BigInt(gatewayFeePaise)
    - BigInt(refundedExGstPaise) - BigInt(chargebackExGstPaise);
  const base = isFirstSubscription && balance > 0n ? balance : 0n;
  return {
    eligibleBasePaise: Number(base),
    estimatedCommissionPaise: Number((base + 5n) / 10n),
    ratePercent: 10,
  };
}
