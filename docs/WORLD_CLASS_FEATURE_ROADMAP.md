# Minarva Biz — World-Class Product Roadmap

Minarva Biz should compete as a complete retail + tailoring + laundry + service operations platform, not only as a billing application.

## Product pillars

### 1. Intelligent daily command center — P0
- Smart business insights: sales trend, profit trend, cash risk, overdue collections, low-stock urgency, delivery risk.
- Global command palette (`Ctrl/Cmd + K`) for every module and action.
- Universal search across customers, invoices, orders, products, payments and staff.
- Action shortcuts: new sale, new order, collect payment, print invoice, create backup.
- Exception-first dashboard: show problems before routine metrics.

### 2. Retail-grade POS — P0
- Barcode scanner workflow and fast product lookup.
- Hold/resume multiple carts.
- Suspended bills and parked quotations.
- Split payments, partial payments, refunds and exchanges.
- Discount approval workflows and cashier limits.
- Thermal/A4 invoice printing and reprint controls.
- Cash drawer open/close and shift reconciliation.
- Offline-first transaction queue with conflict-safe sync.

### 3. Tailoring workflow engine — P0
- Customer measurement profiles with history and quick reuse.
- Job cards, stage tracking, tailor assignment and workload board.
- Cutting → stitching → alteration → QC → ready → delivered workflow.
- Delivery-date risk alerts.
- Material issue/return tracking.
- Order-specific cost and profitability.
- Customer approval/photo references for custom work.

### 4. Laundry & ironing operations — P0
- Bag/ticket/barcode tracking.
- Outsourced supplier workflow and rate cards.
- In-house ironing workflow.
- Item-level status and customer notifications.
- Supplier SLA/performance tracking.
- Profit per ticket and margin alerts.

### 5. Inventory intelligence — P1
- Variant matrix (size/color/fabric).
- Reorder points, safety stock and suggested purchase quantity.
- Stock ageing and dead-stock detection.
- Batch/lot and serial support where applicable.
- Stock transfers between locations.
- Purchase receiving and supplier reconciliation.
- Barcode/label printing.

### 6. CRM + retention engine — P1
- Full customer 360 profile.
- Purchase/order history, measurements and preferences.
- Loyalty points, tiers and rewards.
- Coupons, campaigns and birthday/anniversary automation.
- Win-back and inactive-customer campaigns.
- Customer segmentation by value, recency and behaviour.
- Consent-aware communication history.

### 7. Omnichannel communications — P1
- WhatsApp/SMS/email templates.
- Order received, ready, overdue, payment due and promotional events.
- Delivery links and invoice sharing.
- Communication audit trail.
- Provider abstraction so businesses can switch messaging vendors.

### 8. AI Business Copilot — P1
- Natural-language questions over the business data: "What sold best this month?".
- Explain profit changes and unusual expense spikes.
- Suggest reorder priorities.
- Forecast sales/cash demand.
- Draft customer messages and campaign copy.
- Surface risks with explainable evidence, not opaque scores.
- Keep sensitive business data local by default; cloud AI must be explicitly enabled.

### 9. Finance & controls — P1
- Cash/bank/card reconciliation.
- Customer and supplier ledgers.
- Payment collection dashboard.
- Expense approval rules.
- Day-end close with immutable summary.
- Profit by product/service/tailor/order/customer.
- Audit log with actor, timestamp, before/after and reason.

### 10. Multi-branch / enterprise — P1
- Branch-level inventory, cash sessions and users.
- Central HQ dashboards.
- Branch transfer and consolidated reports.
- Role/permission policies.
- Approval workflows.
- Device management and license entitlements.

### 11. Reliability & security — P0
- SQLite integrity checks and atomic backups.
- Automatic safety backup before restore.
- Signed commercial licenses with device binding.
- Offline license validation and grace policy.
- Secure Electron IPC sender validation.
- No client-side private signing keys.
- Explicit recovery diagnostics and exportable support bundle.
- Automated CI smoke tests for renderer, Electron and Windows installer.

### 12. Platform & integrations — P2
- REST/webhook API.
- Accounting exports and integration adapters.
- E-commerce/catalog sync.
- Payment gateway adapters.
- Shipping/delivery integrations.
- Import/export tools for migration from common POS systems.

## Delivery strategy

**P0 (release quality):** reliability, POS speed, tailoring/laundry workflows, inventory controls, smart command center, backup/restore, security and licensing.

**P1 (differentiation):** CRM/loyalty, omnichannel automation, AI Business Copilot, advanced finance, multi-branch and operational forecasting.

**P2 (ecosystem):** API, e-commerce, accounting, payment and logistics integrations.

Every feature must preserve offline operation for the Windows edition wherever the business workflow can reasonably operate offline. Cloud functionality should be additive rather than a single point of failure.
