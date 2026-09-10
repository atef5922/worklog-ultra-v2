import { z } from "zod";

const emailField = z.string().trim().email("Enter a valid email address.").transform((value) => value.toLowerCase());

export const roleSchema = z.enum(["employee", "hr", "manager", "admin"]);

export const registerRoleSchema = z.object({
  role: roleSchema,
  name: z.string().trim().min(2, "Name is required."),
  email: emailField,
  password: z.string().min(8, "Password must be at least 8 characters."),
  departmentId: z.string().uuid().nullable().optional(),
  designation: z.string().trim().max(120).optional().or(z.literal("")),
  accessCode: z.string().optional().or(z.literal("")),
});

export const verifyRegistrationSchema = z.object({
  email: emailField,
  role: roleSchema,
  code: z.string().regex(/^\d{6}$/, "Enter the 6 digit verification code."),
});

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(8, "Password must be at least 8 characters."),
  remember: z.coerce.boolean().optional().default(false),
});

export const forgotPasswordSchema = z.object({
  email: emailField,
});

export const resetPasswordSchema = z.object({
  email: emailField,
  code: z.string().regex(/^\d{6}$/, "Enter the 6 digit reset code."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});
