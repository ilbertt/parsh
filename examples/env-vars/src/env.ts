import { z } from 'zod';

export const portSchema = z.number().int().positive();
export const nodeEnvSchema = z.enum(['development', 'production', 'test']);
export const databaseUrlSchema = z.url();
