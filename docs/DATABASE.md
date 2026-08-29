# MINARVA BIZ — Database Design

## Principles
- UUID primary keys for Online ↔ Offline compatibility
- Soft deletes via deleted_at
- Optimistic concurrency via version
- Device tracking via device_id
- Branch-ready (branch_id optional)

## Phase 1 Foundation Tables
users, roles, permissions, role_permissions, user_roles, branches,
licenses, license_activations, devices,
settings, audit_logs, sync_queue

## Planned (later phases)
customers, products, inventory, sales, orders, measurements,
expenses, purchases, suppliers, staff, laundry, invoices, returns, notifications
