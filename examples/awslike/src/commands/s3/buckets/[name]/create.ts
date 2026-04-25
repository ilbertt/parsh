import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('s3 buckets [name] create', {
  description: 'Create a new S3 bucket.',
  options: {
    public: z.boolean().optional(),
  },
  handler: (ctx) => {
    const name = ctx.parents['s3 buckets [name]'].params.name;
    const acl = ctx.options.public ? 'public-read' : 'private';
    console.log(`Creating bucket ${name} (${acl}) in ${ctx.root.options.region}`);
  },
});
