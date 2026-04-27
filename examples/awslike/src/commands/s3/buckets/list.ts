import { defineCommand } from '@parshjs/core';

export const command = defineCommand('s3 buckets list', {
  description: 'List S3 buckets.',
  options: {},
  handler: ({ rootOptions, parents, print }) => {
    print.info(`Buckets in ${rootOptions.region} (profile=${parents.s3.options.profile})`);
  },
});
