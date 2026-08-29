# Domain persistence

## Snapshot format

Versioned JSON (`SNAPSHOT_VERSION = 1`) containing customers, products, categories,
sales, payments, orders, laundry, expenses, purchases, suppliers, staff, returns,
audit, branches.

## APIs

```ts
import {
  exportDomainSnapshotJson,
  importDomainSnapshotJson,
} from "@minarvabiz/business-logic";
```

## UI

Settings → Domain persistence panel: export download, import file, localStorage save/load.

## Desktop

Electron IPC writes `userData/minarvabiz-db.json` (file-JSON adapter).  
Domain snapshot can additionally be exported from Settings for backup/migration.

## Online

`createDatabase({ edition: "online" })` uses Supabase config from env when present;
falls back to memory bridge until table mappers are implemented.
