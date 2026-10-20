# Windows supplier opening payable preflight

The existing Windows Add Supplier handler previously used `Number(raw)||0`, silently treating invalid text (NaN), non-numeric input and blank-looking values as a zero opening payable. This can create a supplier master without the intended Accounts Payable / Opening Balance Equity posting.

The desktop UI now validates non-empty amounts with the existing MIT-attributed shared validator already adopted in PR #528. Empty input remains an explicit zero; malformed, unsafe, negative or excessive-precision values fail closed and surface the existing form error before the supplier is created. The existing domain's own cent-safe validation and audited accounting commit remain authoritative. No migration, online endpoint or dependency was added.

This is a local first-customer input-safety fix, not Windows installer or offline sync acceptance.
