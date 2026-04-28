import { z } from 'zod';

export const requestOptions = {
  header: {
    schema: z.array(z.string()).default([]),
    aliases: ['H'],
    forwardToChildren: true,
    description: 'Header in `Name: value` form. Repeatable.',
  },
  query: {
    schema: z.array(z.string()).default([]),
    aliases: ['q'],
    forwardToChildren: true,
    description: 'Query parameter in `key=value` form. Repeatable.',
  },
} as const;

export const dataOption = {
  data: {
    schema: z.string().optional(),
    aliases: ['d'],
    forwardToChildren: true,
    description: 'Raw request body. Sent as `application/json` unless `--header` overrides.',
  },
} as const;
