import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('s3 buckets [name] objects list', {
  description: 'List objects in a bucket.',
  options: {
    prefix: z.string().optional(),
  },
  handler: ({ options, parents }) => {
    const bucket = parents['s3 buckets [name]'].params.name;
    const filter = options.prefix ? ` matching ${options.prefix}` : '';
    console.log(`Objects in s3://${bucket}${filter} (profile=${parents.s3.options.profile})`);
  },
});
