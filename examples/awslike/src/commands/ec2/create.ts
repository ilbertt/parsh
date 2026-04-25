import { defineCommand } from '@repo/core';
import { z } from 'zod';

const MIN_VCPU = 0.25;
const MAX_VCPU = 5;

export const command = defineCommand('ec2 create', {
  description: 'Create a new EC2 instance.',
  options: {
    name: z.string(),
    cpuCount: z.number().min(MIN_VCPU).max(MAX_VCPU),
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
