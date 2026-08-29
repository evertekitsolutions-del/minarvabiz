# Database

## Editions

| Edition | Engine | DDL source |
|---------|--------|------------|
| Online | PostgreSQL (Supabase) | `packages/database/src/sql/postgres-ddl.ts` |
| Offline | SQLite | `packages/database/src/sql/sqlite-ddl.ts` |
| Hybrid | SQLite primary + Postgres cloud | Both + outbox |

## Repository pattern

```ts
import { createMemoryUnitOfWork } from "@minarvabiz/database";

const db = createMemoryUnitOfWork();
await db.customers.list();
```

Replace with Drizzle-backed adapters at deploy time without changing domain code.

## Auth

Local auth (`packages/database/src/auth.ts`): PBKDF2 password hashes, session tokens.
Online can additionally use Supabase Auth while desktop keeps local auth.

## Soft delete & version

Tables include `deleted_at` and `version` for hybrid conflict resolution.
