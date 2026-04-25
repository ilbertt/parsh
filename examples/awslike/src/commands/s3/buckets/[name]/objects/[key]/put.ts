import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('s3 buckets [name] objects [key] put', {
  description: 'Upload an object.',
  options: {
    body: z.string(),
  },
  handler: (ctx) => {
    const bucket = ctx.parents['s3 buckets [name]'].params.name;
    const key = ctx.parents['s3 buckets [name] objects [key]'].params.key;
    console.log(`Uploading ${ctx.options.body.length} bytes to s3://${bucket}/${key}`);
  },
});
