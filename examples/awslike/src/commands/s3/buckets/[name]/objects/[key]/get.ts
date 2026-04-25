import { defineCommand } from '@repo/core';

export const command = defineCommand('s3 buckets [name] objects [key] get', {
  description: 'Download an object.',
  options: {},
  handler: async (ctx) => {
    const bucket = ctx.parents['s3 buckets [name]'].params.name;
    const key = ctx.parents['s3 buckets [name] objects [key]'].params.key;
    console.log(`Fetching s3://${bucket}/${key}…`);
    await new Promise((r) => setTimeout(r, 50));
    console.log(`<bytes for ${key}>`);
  },
});
