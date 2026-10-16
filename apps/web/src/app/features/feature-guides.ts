/**
 * Public marketing education only. These workflows describe product scope,
 * not proof that a particular customer edition has passed end-to-end UAT.
 * No live data, invented testimonials or client credentials.
 */
export type FeatureGuide = {
  slug: string;
  title: string;
  eyebrow: string;
  headline: string;
  summary: string;
  example: string;
  steps: { title: string; detail: string }[];
  benefits: { title: string; detail: string }[];
};
export const featureGuides: FeatureGuide[] = [
  {
    slug:"billing-pos", title:"Billing & POS", eyebrow:"Sales and invoicing",
    headline:"Turn a busy counter into a clearer checkout.",
    summary:"Organize quotations, customer invoices, sale items and payment records together instead of transferring information between disconnected registers and spreadsheets.",
    example:"An illustration: a customer buys two products and pays part in cash and part digitally. Review each invoice line, payment and remaining balance in the billing workflow.",
    steps:[
      {title:"Choose the customer",detail:"Start with a walk-in buyer or an existing customer record to keep sales associated with the right account."},
      {title:"Build the bill",detail:"Add product or service items with quantities and prices, then check any applicable discounts and tax configuration."},
      {title:"Capture payments",detail:"Record the amounts paid and the permitted payment methods alongside the invoice rather than keeping a separate payment note."},
      {title:"Finish and review",detail:"Preview the invoice template, save the sales transaction and use reporting to review completed checkout work."}
    ],
    benefits:[
      {title:"Invoices & quotations",detail:"Keep customer estimates and sales bills in an organized transaction history."},
      {title:"Customer balances",detail:"Follow permitted partial settlements and amounts still due on a customer transaction."},
      {title:"Printing & templates",detail:"Use configurable print and label formats where supported by the edition and hardware."},
      {title:"Sales activity",detail:"Review sales and collections using the connected reporting workspace."}
    ]
  },
  {
    slug:"inventory", title:"Inventory", eyebrow:"Products, stock and purchasing",
    headline:"Know your stock before the next sale.",
    summary:"Maintain a useful view of products, variants, inventory movements and suppliers so the team can handle incoming purchases and outgoing sales with fewer separate records.",
    example:"An illustration: a popular product is running low. Review the quantity, plan a supplier purchase and follow the received stock before the next checkout.",
    steps:[
      {title:"Set up product records",detail:"Organize product names, item codes, units, categories and the opening quantities you intend to manage."},
      {title:"Check stock availability",detail:"Review the stock balances and movement details relevant to the business and its location."},
      {title:"Receive new items",detail:"Document purchased stock and related supplier records so incoming quantities have a traceable business source."},
      {title:"Review movement history",detail:"Inspect how purchases, sales and adjustments affect the available quantities and business reports."}
    ],
    benefits:[
      {title:"Products & variants",detail:"Maintain a searchable catalogue for stocked goods, service items and their relevant classifications."},
      {title:"Stock movements",detail:"Follow inventory increases and decreases through the supported transaction flows."},
      {title:"Supplier purchases",detail:"Connect purchasing activity with incoming products and supplier accounts."},
      {title:"Barcode labels",detail:"Prepare stock identification labels and print-ready layouts for compatible hardware."}
    ]
  },
  {
    slug:"gst-accounting", title:"GST & Accounting", eyebrow:"Finance and business records",
    headline:"Connect financial records with everyday work.",
    summary:"Bring tax-aware sales records, customer dues, purchases, expenses and payment activity into a clearer accounting workflow with country-specific requirements handled through appropriate configuration.",
    example:"An illustration: record a sale, an electricity expense and a supplier payment, then review how the entries contribute to the business summary.",
    steps:[
      {title:"Set business settings",detail:"Enter the relevant tax configuration, financial preferences and authorized business profile before generating documents."},
      {title:"Capture transactions",detail:"Record sales, supplier purchases, business expenses and collections through their normal workflows."},
      {title:"Review balances",detail:"Inspect receivables, payables and payment history before making a settlement decision."},
      {title:"Prepare reports",detail:"Review the supported ledgers and financial summaries, and verify country-specific tax reporting requirements."}
    ],
    benefits:[
      {title:"Sales & purchase records",detail:"Maintain financial records that connect directly to day-to-day trading activity."},
      {title:"Expense tracking",detail:"Categorize operational expenses and keep the amounts alongside related business records."},
      {title:"Customer & vendor dues",detail:"See outstanding amounts connected to customer sales and supplier purchases."},
      {title:"Tax-aware documents",detail:"Work with configurable tax details without assuming universal compliance in every jurisdiction."}
    ]
  },
  {
    slug:"service-management", title:"Service Management", eyebrow:"Customer jobs and field service",
    headline:"Follow every service job from request to closure.",
    summary:"Give a repairs or field-service business an organized process for recording a customer issue, allocating work to technicians, following job status and preparing the final invoice.",
    example:"An illustration: a customer reports a CCTV camera fault. Register the request, allocate the visit, update work notes and close the ticket after the service.",
    steps:[
      {title:"Register the request",detail:"Capture the customer, affected equipment, complaint and location or contact details relevant to the job."},
      {title:"Allocate the work",detail:"Assign the appropriate engineer or internal team member and review the expected visit or service stage."},
      {title:"Document progress",detail:"Update job status, technician observations, materials and the work carried out as it moves forward."},
      {title:"Complete the service",detail:"Close the service record and prepare any applicable customer billing or follow-up action."}
    ],
    benefits:[
      {title:"Service register",detail:"Keep manual service requests and issue descriptions as separately trackable work orders."},
      {title:"Engineer assignment",detail:"Organize technician responsibility for incoming repair or onsite service jobs."},
      {title:"Job status and notes",detail:"Review recorded progress, stages and relevant service details from one workflow."},
      {title:"Service billing",detail:"Prepare an invoice or payment entry for applicable parts, labor and service charges."}
    ]
  },
  {
    slug:"tailoring", title:"Tailoring", eyebrow:"Measurements and custom orders",
    headline:"Give each customer order a clear path to delivery.",
    summary:"Organize the measurements, service details, garment specifications, progress and handover information that fashion and tailoring businesses need for made-to-order or alteration jobs.",
    example:"An illustration: a customer places an alteration order with measurement notes and a due date. The team records each stage until fitting and delivery.",
    steps:[
      {title:"Record the customer brief",detail:"Capture the garment type, design requirements, delivery expectations and customer instructions."},
      {title:"Save relevant measurements",detail:"Keep sizing and measurement notes attached to the correct customer and tailoring order."},
      {title:"Follow production stages",detail:"Track the tailoring or alteration workflow, assignments and progress notes as work advances."},
      {title:"Handover and charge",detail:"Review the completed order, prepare the customer bill and record the applicable collection."}
    ],
    benefits:[
      {title:"Measurements",detail:"Maintain customer measurements and specifications without repeating every note from scratch."},
      {title:"Job cards",detail:"Organize garment details and alteration requests into customer-specific work records."},
      {title:"Delivery tracking",detail:"See expected dates and operational order stages for pending and completed garments."},
      {title:"Material and billing",detail:"Connect order-related materials and service charges to the supported financial workflow."}
    ]
  },
  {
    slug:"laundry", title:"Laundry", eyebrow:"Garment processing and handover",
    headline:"Keep garments, service stages and delivery organized.",
    summary:"Track laundry and ironing requests from counter intake through processing, pickup or delivery, with customer notes, chargeable services and payment history in one workflow.",
    example:"An illustration: a walk-in customer drops off shirts for washing and ironing. Record the pieces, work requested, expected collection date and closing payment.",
    steps:[
      {title:"Register the items",detail:"Enter the garments, quantities and care services requested by the customer at intake."},
      {title:"Set the expected handover",detail:"Record the due date and any relevant processing or customer instructions for the order."},
      {title:"Update processing",detail:"Move work through its supported laundry or ironing status stages as the garments are handled."},
      {title:"Deliver and collect",detail:"Close the customer order and record the payment or balance for the provided service."}
    ],
    benefits:[
      {title:"Laundry tickets",detail:"Keep a record of received garments, required services and customer-specific notes."},
      {title:"Processing status",detail:"Review which service orders are pending, progressing, ready or completed."},
      {title:"Pricing and quantity",detail:"Associate chargeable service items and quantities with each laundry order."},
      {title:"Customer history",detail:"Make repeat order information and relevant balances easier to locate."}
    ]
  },
  {
    slug:"customers-crm", title:"Customers & CRM", eyebrow:"Customer records and follow-ups",
    headline:"Find the customer context behind each transaction.",
    summary:"Keep customer details, invoices, service requests, outstanding amounts and relevant contact history connected so the team can follow up with less manual searching.",
    example:"An illustration: a returning customer calls about a repair and an unpaid invoice. Open the customer's record to review the related work and balance before responding.",
    steps:[
      {title:"Register the customer",detail:"Capture relevant customer contact details and optional business information in a structured record."},
      {title:"Connect daily transactions",detail:"Associate the customer with invoices, orders and authorized service work as those records are created."},
      {title:"Review obligations",detail:"Check pending orders and customer balances to understand what follow-up is needed."},
      {title:"Update customer notes",detail:"Record the relevant context and maintain an organized history for future interactions."}
    ],
    benefits:[
      {title:"Customer directory",detail:"Maintain searchable customer records and useful contact information across daily work."},
      {title:"Order and invoice history",detail:"Navigate from the customer to related sales or service documents as supported."},
      {title:"Outstanding balances",detail:"Review receivables and payments linked to the customer rather than in an isolated list."},
      {title:"Service context",detail:"Keep relevant service orders and their stages connected to customer support work."}
    ]
  },
  {
    slug:"reports-analytics", title:"Reports & Analytics", eyebrow:"Daily oversight and decisions",
    headline:"Give every business day a clearer summary.",
    summary:"Use organized views of sales, payments, stock movement, purchases and expenses to understand what changed and which operational records might need attention.",
    example:"An illustration: at closing time, review today's sales, payment collections, supplier purchases and pending service jobs before planning tomorrow.",
    steps:[
      {title:"Capture the day's activity",detail:"Complete the real sales, purchases, expenses and service transactions in their relevant modules."},
      {title:"Open business summaries",detail:"Review the supported charts and tables showing totals and recorded movements."},
      {title:"Check exceptions",detail:"Identify pending dues, low-stock signals or open operational work for follow-up."},
      {title:"Use the information",detail:"Compare the available report periods and verify figures against recorded transactions before decisions."}
    ],
    benefits:[
      {title:"Sales performance",detail:"Review supported invoice and collection summaries without maintaining a second sales ledger."},
      {title:"Stock visibility",detail:"Inspect inventory movements and related purchase or sale activity."},
      {title:"Business expenses",detail:"Keep an overview of recorded operating costs and the periods they belong to."},
      {title:"Operational tracking",detail:"See available order or service status information alongside other business indicators."}
    ]
  }
];

export function findFeatureGuide(slug: string): FeatureGuide | undefined {
  return featureGuides.find(item=>item.slug===slug);
}
