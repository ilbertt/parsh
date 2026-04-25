import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('ec2 create', {
  description: 'Create a new EC2 instance.',
  options: {
    name: z.string(),
    cpuCount: z.number().min(0.25).max(5),
  },
  handler: (ctx) => {
    if (ctx.parents.ec2.options.askConfirmation) {
      console.warn('!! I should ask for permissions here !!');
    }

    console.log('Creating instance with:');
    console.log(`  Name: ${ctx.options.name}`);
    console.log(`  CPU: ${ctx.options.cpuCount} vCPU`);
    console.log(`Current region: ${ctx.root.options.region}`);
    console.log(`Current identity: ${ctx.root.options.identity}`);

    console.log('Created!');
  },
});
