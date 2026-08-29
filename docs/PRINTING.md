# Printing

Minarva Biz uses the OS/browser print dialog for:
- A4 invoices (`printSaleInvoice(sale, "a4")`)
- Thermal-width layout (`printSaleInvoice(sale, "thermal")`)
- Order tickets / delivery challans

Raw ESC/POS USB drivers are **not** required for release. On Windows, select the thermal printer in the system print dialog and use the thermal paper size.
