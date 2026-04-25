import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('s3 buckets [name] objects [key] put', {
  description: 'Upload an object.',
  options: {
    body: { schema: z.string() },
  },
  handler: ({ options, parents }) => {
    const bucket = parents['s3 buckets [name]'].params.name;
    const key = parents['s3 buckets [name] objects [key]'].params.key;
    console.log(`Uploading ${options.body.length} bytes to s3://${bucket}/${key}`);
  },
});
