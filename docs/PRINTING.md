# Printing

Minarva Biz supports:
- A4 invoices (`printSaleInvoice(sale, "a4")`)
- Thermal-width invoices (`printSaleInvoice(sale, "thermal")`)
- Order tickets / delivery challans
- Named Windows printers for direct printing from the desktop edition

## Windows printer verification

In **Settings → Printer settings**, choose the A4 or thermal printer that matches the default invoice paper, then use **Test selected printer**.

The desktop app now verifies that the configured Windows printer still exists before submitting a direct print job and shows the print result in Settings. This catches renamed, removed, or stale printer selections before customer billing.

Raw ESC/POS USB drivers are **not** required for release. Browser/web printing continues to use the normal OS/browser print dialog.

A successful automated build or printer-list check does not prove physical output quality. Before customer delivery, print at least one real A4 or thermal test page on the intended printer and confirm paper size, margins, legibility, and cut/spacing as applicable.
