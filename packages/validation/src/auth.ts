import { z } from 'zod';
import { EMAIL_PATTERN } from './common.js';

/** Mirrors the rules enforced by `apps/api/src/controllers/auth.controller.js#login`. */
export const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$/;

export const passwordSchema = z
  .string({ error: 'Password is required' })
  .min(1, 'Password is required')
  .min(8, 'Password must be at least 8 characters long')
  .regex(PASSWORD_PATTERN, 'Password must contain at least one letter and one number');

export const loginRequestSchema = z.object({
  email: z
    .string({ error: 'Email is required' })
    .min(1, 'Email is required')
    .regex(EMAIL_PATTERN, 'Invalid email format'),
  password: passwordSchema,
});

export type LoginRequestInput = z.infer<typeof loginRequestSchema>;
