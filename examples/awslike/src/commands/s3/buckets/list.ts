import { defineCommand } from '@repo/core';

export const command = defineCommand('s3 buckets list', {
  description: 'List S3 buckets.',
  options: {},
  handler: ({ root, parents, print }) => {
    print.info(`Buckets in ${root.options.region} (profile=${parents.s3.options.profile})`);
  },
});
