# UBP-05f — pure dimension sale RPC serializer

The new `serializeDimensionSaleLine()` produces canonical
`{dimension_metadata: dimension-line-v1}` fields for a *future*
authenticated web / Windows hybrid `create_sale` request. It uses the
existing bigint dimensional calculator as the source of truth and
integer thousandths for quantity comparison. It rejects stale
measurement metadata, unsupported algorithm versions, sub-milli
quantities, unknown record keys, and prepopulated snake_case fields.

Legacy/non-dimensional lines serialize an empty object and are
unchanged. All outputs are frozen; the input is never reused as
mutable network payload.

**Not activated:** the current cloud writer's fail-closed guard from
UBP-05d still rejects dimensional sales until UBP-05c storage and
UBP-05e authenticated atomic RPC are deployed and verified in the
customer's applicable environment. The serializer alone proves
neither permissions nor remote schema readiness. It does not dispatch
any network request, acknowledge outbox events, adjust stock, or
change customer data.

Regression:
`node --test packages/business-logic/src/__tests__/dimension-sale-wire.test.mjs`
and the complete CI business-logic/coverage suites.

Next milestone: capability handshake + verified RPC transport mapping
and replay after tenant/branch, offline payment/stock and migration
readiness checks. Never silently downgrade to legacy DML.
