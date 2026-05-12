/**
 * Form validation constants and schemas
 */

import { z } from "zod";

export const TOKEN_VALIDATION_LIMITS = {
  NAME_MAX_LENGTH: 100,
  TICKER_MAX_LENGTH: 10,
  DESCRIPTION_MAX_LENGTH: 1000,
} as const;

const socialInput = z.string().trim().max(500, "Social link must be less than 500 characters").optional().or(z.literal(""));

export const tokenSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Token name is required")
    .max(TOKEN_VALIDATION_LIMITS.NAME_MAX_LENGTH, `Token name must be less than ${TOKEN_VALIDATION_LIMITS.NAME_MAX_LENGTH} characters`),
  ticker: z
    .string()
    .trim()
    .min(1, "Ticker is required")
    .max(TOKEN_VALIDATION_LIMITS.TICKER_MAX_LENGTH, `Ticker must be less than ${TOKEN_VALIDATION_LIMITS.TICKER_MAX_LENGTH} characters`),
  description: z
    .string()
    .max(TOKEN_VALIDATION_LIMITS.DESCRIPTION_MAX_LENGTH, `Description must be less than ${TOKEN_VALIDATION_LIMITS.DESCRIPTION_MAX_LENGTH} characters`)
    .optional(),
  website: z.string().url("Invalid URL").optional().or(z.literal("")),
  twitter: socialInput,
  otherLink: z.string().url("Invalid URL").optional().or(z.literal("")),
});
