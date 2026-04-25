import { defineCommand } from '@repo/core';

const FAKE_LATENCY_MS = 50;

export const command = defineCommand('s3 buckets [name] objects [key] get', {
  description: 'Download an object.',
  options: {},
  handler: async (ctx) => {
    const bucket = ctx.parents['s3 buckets [name]'].params.name;
    const key = ctx.parents['s3 buckets [name] objects [key]'].params.key;
    console.log(`Fetching s3://${bucket}/${key}…`);
    await new Promise((r) => setTimeout(r, FAKE_LATENCY_MS));
    console.log(`<bytes for ${key}>`);
  },
});
