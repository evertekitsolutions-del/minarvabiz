import { z } from "zod";
export const uuidSchema = z.string().uuid();
export const emailSchema = z.string().email().max(255);
export const phoneSchema = z.string().min(7).max(20).regex(/^[+\d\s\-()]+$/);
export const moneySchema = z.number().finite().refine((v) => v >= 0);
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(8).max(128) });
export const createUserSchema = z.object({
  email: emailSchema, fullName: z.string().trim().min(1).max(500),
  phone: phoneSchema.optional().nullable(),
  role: z.enum(["super_admin","admin","manager","cashier","tailor","staff"]),
  password: z.string().min(8).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
