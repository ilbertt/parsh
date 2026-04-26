import { defineCommand } from '@repo/core';

export const command = defineCommand('ec2 instances list', {
  description: 'List EC2 instances.',
  options: {},
  handler: ({ rootOptions, print }) => {
    print.info(`Listing EC2 instances in ${rootOptions.region} as ${rootOptions.identity}`);
  },
});
