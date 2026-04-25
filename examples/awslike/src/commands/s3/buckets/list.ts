import { defineCommand } from '@repo/core';

export const command = defineCommand('s3 buckets list', {
  description: 'List S3 buckets.',
  options: {},
  handler: (ctx) => {
    console.log(
      `Buckets in ${ctx.root.options.region} (profile=${ctx.parents.s3.options.profile})`,
    );
  },
});
