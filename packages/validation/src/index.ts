import { z } from "zod";

export const uuidSchema = z.string().uuid();
export const emailSchema = z.string().email().max(255);
export const phoneSchema = z.string().min(7).max(20).regex(/^[+\d\s\-()]+$/, "Invalid phone number");
export const moneySchema = z.number().finite().refine((v) => v >= 0, { message: "Amount cannot be negative" });
export const percentageSchema = z.number().min(0).max(100);
export const nonEmptyStringSchema = z.string().trim().min(1).max(500);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(128),
});

export const createUserSchema = z.object({
  email: emailSchema,
  fullName: nonEmptyStringSchema,
  phone: phoneSchema.optional().nullable(),
  role: z.enum(["super_admin", "admin", "manager", "cashier", "tailor", "staff"]),
  password: z.string().min(8).max(128),
});

export const customerSchema = z.object({
  name: nonEmptyStringSchema,
  phone: phoneSchema.optional().nullable(),
  whatsapp: phoneSchema.optional().nullable(),
  email: emailSchema.optional().nullable().or(z.literal("")),
  address: z.string().max(1000).optional().nullable(),
  birthday: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const productSchema = z.object({
  name: nonEmptyStringSchema,
  sku: z.string().max(64).optional().nullable(),
  barcode: z.string().max(64).optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  brand: z.string().max(100).optional().nullable(),
  size: z.string().max(50).optional().nullable(),
  color: z.string().max(50).optional().nullable(),
  unit: z.string().min(1).max(20).default("pcs"),
  costPrice: moneySchema,
  sellingPrice: moneySchema,
  discount: percentageSchema.optional().nullable(),
  taxRate: percentageSchema.optional().nullable(),
  stockQuantity: z.number().int().default(0),
  minimumStock: z.number().int().min(0).default(0),
  supplierId: z.string().uuid().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const categorySchema = z.object({
  name: nonEmptyStringSchema,
  description: z.string().max(500).optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().default(true),
});

export const stockAdjustmentSchema = z.object({
  productId: uuidSchema,
  type: z.enum(["stock_in", "stock_out", "adjustment"]),
  quantity: z.number().refine((v) => v !== 0, "Quantity cannot be zero"),
  notes: z.string().max(500).optional().nullable(),
});

export const cartLineSchema = z.object({
  productId: uuidSchema,
  quantity: z.number().positive(),
  unitPrice: moneySchema,
  discountPercent: percentageSchema.default(0),
  taxRate: percentageSchema.default(0),
});

export const createSaleSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  items: z.array(cartLineSchema).min(1),
  paidAmount: moneySchema.default(0),
  paymentMethod: z.enum(["cash", "card", "bank", "upi", "other"]).default("cash"),
  notes: z.string().max(1000).optional().nullable(),
  allowNegativeStock: z.boolean().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type CustomerInput = z.infer<typeof customerSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;
export type CreateSaleInput = z.infer<typeof createSaleSchema>;
