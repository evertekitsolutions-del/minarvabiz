/**
 * Public, illustrated business use-cases. These are not live account data,
 * customer reviews, regulatory guarantees or promises of enabled integrations.
 * Keep examples detached from authenticated workspace and customer PII.
 */
export type IndustryGuide = {
  slug: string;
  title: string;
  subtitle: string;
  summary: string;
  audience: string;
  badge: string;
  steps: { title: string; body: string }[];
  capabilities: { title: string; description: string }[];
};

export const industryGuides: IndustryGuide[] = [
  {
    slug: "retail-store",
    title: "Retail Store",
    subtitle: "Everyday sales, stock and repeat customers",
    summary: "Bring counter sales, supplier purchases, product stock, payment collection and end-of-day review into a clearer connected process for a busy retail shop.",
    audience: "Convenience stores · General retail · Accessories",
    badge: "Retail operations",
    steps: [
      {title:"Organize the catalogue",body:"Set up product details, item codes, opening quantities and selling prices before starting sales."},
      {title:"Sell at the counter",body:"Create an invoice with products, quantities, discounts where supported and the customer's payment details."},
      {title:"Replenish what sells",body:"Review remaining stock and record supplier purchases to maintain an accurate stock movement history."},
      {title:"Review the day's activity",body:"Compare sales, payments, expenses and inventory changes using the business reporting screens."},
    ],
    capabilities: [
      {title:"Billing & POS",description:"Structure daily invoicing and product-based checkout around a clear cashier workflow."},
      {title:"Inventory & Labels",description:"Manage product records, barcode labels, opening stock and stock movements."},
      {title:"Purchase & Suppliers",description:"Track purchasing, supplier balances, incoming stock and payment settlements."},
      {title:"Sales Reports",description:"Use sales and payment summaries to review the shop's trading activity."},
    ],
  },
  {
    slug: "boutique-fashion",
    title: "Boutique & Fashion",
    subtitle: "Garments, fabrics and customer-specific orders",
    summary: "Follow a fashion customer's journey from choosing fabric or ready-made garments through measurements, tailoring, alterations, order progress and final billing.",
    audience: "Boutiques · Tailoring studios · Fashion shops",
    badge: "Boutique operations",
    steps: [
      {title:"Register products and fabrics",body:"Keep garments, materials, accessories and fabric quantities organized in the product catalogue."},
      {title:"Record the customer order",body:"Capture the customer's tailoring request, measurement notes, alteration details and expected delivery."},
      {title:"Follow the work",body:"Track the order as work is assigned, progressed and prepared for customer handover."},
      {title:"Bill and complete delivery",body:"Create the sales or service invoice, record payments and close the customer order."},
    ],
    capabilities: [
      {title:"Measurements",description:"Keep customer measurements and tailoring notes with the related service order."},
      {title:"Custom & Alteration Orders",description:"Organize customer-specific garment work, alterations and order stages."},
      {title:"Material Inventory",description:"Track boutique inventory, fabrics and accessories as operational stock records."},
      {title:"Order Billing",description:"Link finished work with invoicing and customer payment workflows."},
    ],
  },
  {
    slug: "computer-electronics",
    title: "Computer & Electronics",
    subtitle: "Product sales and repair work in one place",
    summary: "Combine equipment sales, accessories, repair intake, job assignment, spare parts, customer balances and service billing for a computer or electronics business.",
    audience: "Computer shops · Electronics dealers · Repair counters",
    badge: "Electronics operations",
    steps: [
      {title:"Set up products and accessories",body:"Maintain stock records for computers, equipment, accessories and service-related items."},
      {title:"Register a repair request",body:"Record the device, customer issue, job notes and the expected next action."},
      {title:"Assign and follow service",body:"Allocate repair work and update its stage as inspection, repair or handover progresses."},
      {title:"Close the sale or repair",body:"Prepare service charges or product invoices and record customer collections."},
    ],
    capabilities: [
      {title:"Products & Inventory",description:"Manage product items, purchase movements and accessories for sale or service."},
      {title:"Repair Job Tracking",description:"Register repair work and record the progress of customer service requests."},
      {title:"Technician Assignment",description:"Organize internal technician allocations and service status changes."},
      {title:"Service & Sales Billing",description:"Keep repair charges and product sales visible in the accounting workflow."},
    ],
  },
  {
    slug: "service-centers",
    title: "Service Centers",
    subtitle: "From service registration to job closure",
    summary: "Give a field service or maintenance team a structured way to log requests, allocate technicians, track visits, manage job progress and close work with an invoice.",
    audience: "CCTV service · Field technicians · Maintenance teams",
    badge: "Service operations",
    steps: [
      {title:"Log the customer request",body:"Register the reported fault, customer contact and service location within a structured job."},
      {title:"Allocate a technician",body:"Assign the responsible team member and organize the expected visit or next action."},
      {title:"Record work and materials",body:"Update job stages and record relevant labor, spare parts or service notes."},
      {title:"Close and invoice the job",body:"Complete the service record and prepare any charges or customer follow-up."},
    ],
    capabilities: [
      {title:"Service Register",description:"Create trackable service requests with customer details and job descriptions."},
      {title:"Field Staff Workflow",description:"Organize technician allocation, onsite visit details and progress notes."},
      {title:"Parts & Charges",description:"Track service-related materials and prepare the chargeable work record."},
      {title:"Job Status",description:"Review registered, assigned, in-progress and completed service work."},
    ],
  },
  {
    slug: "laundry-ironing",
    title: "Laundry & Ironing",
    subtitle: "Orders, garment handling and handover",
    summary: "Organize garment intake, laundry and ironing services, due dates, pricing, order progress, delivery handover and payments through a simple customer-order workflow.",
    audience: "Laundry shops · Dry-cleaning counters · Ironing services",
    badge: "Laundry operations",
    steps: [
      {title:"Register garments at intake",body:"Record the customer's items, requested service and individual order notes."},
      {title:"Plan the expected handover",body:"Set the expected delivery and identify laundry or ironing work that needs attention."},
      {title:"Update processing stages",body:"Follow order progress through processing, readiness and customer pickup."},
      {title:"Collect payment and deliver",body:"Close the garment order, record payment and update the handover status."},
    ],
    capabilities: [
      {title:"Laundry Tickets",description:"Register customer garments, laundry work and ironing tasks as trackable tickets."},
      {title:"Delivery Progress",description:"Organize pending, ready and completed order stages for staff."},
      {title:"Service Pricing",description:"Link the selected services and quantities with an order amount."},
      {title:"Customer Accounts",description:"Keep customer history, collections and outstanding amounts accessible."},
    ],
  },
  {
    slug: "wholesale",
    title: "Wholesale",
    subtitle: "Bulk orders, buying and business accounts",
    summary: "Coordinate larger customer orders, product quantities, wholesale purchasing, stock availability, supplier settlements and receivables without relying on separate records.",
    audience: "Distributors · Bulk traders · Wholesale dealers",
    badge: "Wholesale operations",
    steps: [
      {title:"Organize bulk product stock",body:"Maintain product quantities, relevant prices and warehouse records before quoting customers."},
      {title:"Prepare customer orders",body:"Create wholesale quotes or orders with line items and quantities as part of sales operations."},
      {title:"Receive and issue stock",body:"Track purchasing and goods movements needed to supply the customer order."},
      {title:"Settle and review balances",body:"Follow sales invoices, supplier payments, receivables and trading reports."},
    ],
    capabilities: [
      {title:"Quotation & Orders",description:"Prepare structured bulk proposals and sales transactions for business customers."},
      {title:"Inventory & Purchasing",description:"Manage receiving, stock movements, suppliers and availability."},
      {title:"Receivables & Payables",description:"Track customer balances alongside supplier purchase settlements."},
      {title:"Business Reports",description:"Review purchase, sales and payment records by the relevant operations."},
    ],
  },
];

export function findIndustryGuide(slug: string): IndustryGuide | undefined {
  return industryGuides.find(g => g.slug === slug);
}
