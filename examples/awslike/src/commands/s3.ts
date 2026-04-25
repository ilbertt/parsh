import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('s3', {
  description: 'Manage S3 buckets and objects.',
  options: {
    profile: z.string().default('default'),
  },
  handler: ({ options, root }) => {
    console.log(`S3 — profile=${options.profile}, region=${root.options.region}`);
  },
});
