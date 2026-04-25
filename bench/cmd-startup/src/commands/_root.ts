import { defineRootCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineRootCommand({
  options: { quiet: z.boolean().optional() },
});
