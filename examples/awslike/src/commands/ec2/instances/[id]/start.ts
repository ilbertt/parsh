import { defineCommand } from '@repo/core';

export const command = defineCommand('ec2 instances [id] start', {
  description: 'Start a stopped EC2 instance.',
  options: {},
  handler: (ctx) => {
    const id = ctx.parents['ec2 instances [id]'].params.id;
    if (ctx.parents.ec2.options.askConfirmation) {
      console.warn(`Start ${id}? (y/N)`);
    }
    console.log(`Starting instance ${id} in ${ctx.root.options.region}`);
  },
});
