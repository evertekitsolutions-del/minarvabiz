# A-FIRST-CUSTOMER — Service-order domain exact cents

The service-order form validates monetary inputs, but direct shared-domain callers previously accepted values with more than two decimal places. `calculateOrderPricing` silently rounded amounts such as `100.001`, changing the operator's submitted money before writing the journal.

`ordersStore.createOrder` now reuses the existing `validateMoneyAmountInput` validator for price, discount, advance, external materials, bulk discount, unit price, T-shirt charges and computed totals. Invalid inputs return field errors before any journal, customer, order, payment or outbox mutation.

Regression tests exercise the real stores and verify no side effects for invalid amounts plus exact valid charges. There is no new dependency, schema change, production migration, deployment or Windows installer. This increment does not provide crash-safe multi-store transactions or automatic journal recovery. Refs #325.
