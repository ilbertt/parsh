import { defineCommand } from '@repo/core';

export const command = defineCommand('ec2 instances list', {
  description: 'List EC2 instances.',
  options: {},
  handler: ({ root }) => {
    console.log(`Listing EC2 instances in ${root.options.region} as ${root.options.identity}`);
  },
});
