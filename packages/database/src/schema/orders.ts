export const ORDER_TABLES = [
  "measurement_profiles",
  "orders",
  "order_items",
  "order_measurements",
  "order_expenses",
] as const;

export interface MeasurementProfileRow {
  id: string;
  customerId: string;
  label: string;
  fieldsJson: string;
  notes: string | null;
  recordedAt: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ServiceOrderRow {
  id: string;
  orderNumber: string;
  customerId: string;
  orderDate: string;
  deliveryDate: string | null;
  serviceType: string;
  status: string;
  assignedStaffId: string | null;
  assignedTailorId: string | null;
  measurementProfileId: string | null;
  measurementsJson: string | null;
  notes: string | null;
  materialDetails: string | null;
  customerSuppliedMaterial: boolean;
  shopSuppliedMaterial: boolean;
  price: number;
  discount: number;
  advance: number;
  balance: number;
  externalMaterialCost: number;
  orderExpensesTotal: number;
  quantity: number;
  unitPrice: number;
  bulkDiscount: number;
  tshirtJson: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  branchId: string | null;
  deviceId: string | null;
  createdBy: string | null;
  version: number;
}
