import { pgTable, text, serial, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
  isGoogleUser: boolean("is_google_user").notNull().default(false),
  resetToken: text("reset_token"),
  resetTokenExpiry: text("reset_token_expiry"),
});

// Create base schema with email and password validation
const baseUserSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
});

export const insertUserSchema = createInsertSchema(users, {
  email: baseUserSchema.shape.email,
  password: baseUserSchema.shape.password,
}).omit({
  id: true,
  createdAt: true,
  isGoogleUser: true,
  resetToken: true,
  resetTokenExpiry: true,
});

export const resetPasswordSchema = z.object({
  email: baseUserSchema.shape.email,
});

export const updatePasswordSchema = z.object({
  token: z.string(),
  password: baseUserSchema.shape.password,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;