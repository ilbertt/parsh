import { defineCommand } from '@repo/core';

export const command = defineCommand('ec2 instances list', {
  description: 'List EC2 instances.',
  options: {},
  handler: (ctx) => {
    console.log(
      `Listing EC2 instances in ${ctx.root.options.region} as ${ctx.root.options.identity}`,
    );
  },
});
