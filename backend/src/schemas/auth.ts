import { z } from "zod";

export const emailSignupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
});

export const emailSigninSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const oauthSigninSchema = z.object({
  access_token: z.string().min(1, "access_token is required"),
  provider: z.enum(["google", "apple"]),
  name: z.string().optional(),
});

export const refreshSchema = z.object({
  refresh_token: z.string().min(1, "refresh_token is required"),
});

export const updateProfileSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    upi_id: z
      .string()
      .regex(/^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/, "Invalid UPI VPA format")
      .optional()
      .nullable(),
    phone: z
      .string()
      .regex(/^\+?[1-9]\d{6,14}$/, "Invalid phone number")
      .optional()
      .nullable(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });
