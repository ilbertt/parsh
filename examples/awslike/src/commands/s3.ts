import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('s3', {
  description: 'Manage S3 buckets and objects.',
  options: {
    profile: {
      schema: z.string().default('default'),
      forwardToChildren: true,
      description: 'AWS profile to use for S3 calls.',
    },
  },
  handler: ({ options, rootOptions, print }) => {
    print.info(`S3 — profile=${options.profile}, region=${rootOptions.region}`);
  },
});
