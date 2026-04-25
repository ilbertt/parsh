import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('s3', {
  description: 'Manage S3 buckets and objects.',
  options: {
    profile: z.string().default('default'),
  },
  handler: (ctx) => {
    console.log(`S3 — profile=${ctx.options.profile}, region=${ctx.root.options.region}`);
  },
});
