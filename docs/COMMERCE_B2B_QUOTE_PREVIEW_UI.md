# Seller B2B Quote Preview — UI wiring

**2026-10-20 | Aimeos quantity tiers / Open Mercato B2B design reference | #325**

The existing `quoteCommerceTierPrice()` engine was a read-only business-logic function without an operator workflow. This increment connects it to Products via **B2B price quote preview**. An operator selects an active product, enters quantity and may optionally supply one **temporary** quantity threshold/unit price. The screen renders a regular or discounted quotation preview with an explicit `nonbinding_tier_price_preview` source.

Safety and behavior:

- Shared `parseCommerceQuoteDraft()` validates quantities to 0.001 and money to exact cents, then delegates all arithmetic to `quoteCommerceTierPrice()`.
- No discount rule is saved; no product selling price, invoice, customer outstanding balance, inventory, payment, tax account, journal, remote writer, snapshot, or outbox is modified.
- Input errors are presented without a partially calculated quote. Changing an input invalidates the previous preview.
- This is **not** a customer-confirmed offer, group-membership validation, persisted B2B price-list manager, online checkout, or branch-price authorization.
- The pricing selector used in real sales must be bound later to a verified, versioned, merchant-approved price list and conflict-safe offline sync. Never use browser-editable preview values as payment authority.
- No new dependencies, database changes, live migrations, hosted paid services, Windows release or PHP vendor runtime.

New regression coverage: `packages/business-logic/src/__tests__/commerce-tier-quote-draft.test.mjs`. Existing quantity/group/branch quote engine tests remain unchanged.

Increment toward SAL-014. Full SAL-014 is **not yet complete**.
