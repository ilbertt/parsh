import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('s3 buckets [name] create', {
  description: 'Create a new S3 bucket.',
  options: {
    public: { schema: z.boolean().optional() },
  },
  handler: ({ parents, options, root }) => {
    const name = parents['s3 buckets [name]'].params.name;
    const acl = options.public ? 'public-read' : 'private';
    console.log(`Creating bucket ${name} (${acl}) in ${root.options.region}`);
  },
});
