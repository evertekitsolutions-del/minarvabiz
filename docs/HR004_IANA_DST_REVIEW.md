# HR-004 branch IANA timezone and DST resolution foundation

Base: `1bd1c1b982ff9fbe174336f7cc297900439e553f`. This milestone reuses the merged branch-local roster validator and JavaScript's standard Intl IANA timezone database; **no dependency, third-party source, paid API, production schema or customer data change**.

- Explicit branch `timeZone` input; invalid/missing zone fails closed.
- Local clock-to-UTC round-trip validation catches nonexistent civil times (spring-forward DST gap) and rejects them instead of shifting silently.
- Duplicated civil times (fall-back DST overlap) require an explicit `earlier` or `later` choice; default is `reject`.
- Proper overnight end date and elapsed actual-time delta; returns both wall-clock minutes and instant elapsed minutes, with DST adjustment for transparent policy review.
- Does not change existing roster rows or apply payroll rules. The function is an opt-in domain primitive to be integrated into branch policy, Web/Windows UI, conflict resolver and server authority after review.
- Current PostgreSQL overlap trigger is wall-clock based; cross-DST UTC overlap proof, branch timezone storage, policy versioning, statutory minimum-rest rules and real customer Windows/Hybrid UAT are **still required**. Do not label full HR-004 complete.
