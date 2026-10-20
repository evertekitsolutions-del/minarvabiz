# A-FIRST-CUSTOMER — linked order expense cent-safety

Before this fix, `ordersStore.addOrderExpense` checked only whether the *individual* input fitted a safe integer of cents. It silently rounded some unsupported decimal inputs and then added the amount to a previous total using binary floating-point `round2` without checking the *combined* safe-cent range or corrupted earlier totals. A purchase/expense could therefore change a service order's reported costs to an unrepresentable or inaccurate amount.

The shared order-domain mutation now validates exact cent precision, confirms the live total is a safe non-negative cents value, checks the aggregate addition is safe, and uses integer-cents addition for the new total. Every failure returns a reconciliation/precision error **before** mutating the order or outbox.

Regression tests cover unsupported fractional cents, corrupt saved totals, aggregate overflow, and successful exact-cent addition with duplicate source rejection. This is a domain integrity cut; atomicity of linked expense source and journal on unexpected post-commit failures remains a separate acceptance requirement.

No production migration, infrastructure, runtime dependency or published installer.
