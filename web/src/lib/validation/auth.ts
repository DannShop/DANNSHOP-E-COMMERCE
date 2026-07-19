import { z } from "zod";

const emailField = z
  .email("Email tidak valid")
  .transform((v) => v.trim().toLowerCase());

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(8, "Password minimal 8 karakter"),
});

export const registerSchema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter"),
  email: emailField,
  password: z.string().min(8, "Password minimal 8 karakter"),
});
