import { defineRootCommand } from '@parshjs/core';
import { z } from 'zod';

const DEFAULT_TIMEOUT_SECONDS = 30;

export const command = defineRootCommand({
  options: {
    auth: {
      schema: z.string().optional(),
      forwardToChildren: true,
      aliases: ['a'],
      description: 'Basic auth in `user:pass` form.',
    },
    timeout: {
      schema: z.coerce.number().default(DEFAULT_TIMEOUT_SECONDS),
      forwardToChildren: true,
      description: 'Request timeout in seconds.',
    },
    follow: {
      schema: z.boolean().optional(),
      forwardToChildren: true,
      description: 'Follow redirects.',
    },
    verbose: {
      schema: z.boolean().optional(),
      forwardToChildren: true,
      aliases: ['v'],
      description: 'Print request line and response headers.',
    },
  },
});
