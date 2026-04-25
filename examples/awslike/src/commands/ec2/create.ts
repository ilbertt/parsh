import { defineCommand } from '@repo/core';
import { z } from 'zod';

const MIN_VCPU = 0.25;
const MAX_VCPU = 5;

export const command = defineCommand('ec2 create', {
  description: 'Create a new EC2 instance.',
  options: {
    name: { schema: z.string() },
    cpuCount: { schema: z.number().min(MIN_VCPU).max(MAX_VCPU) },
  },
  handler: ({ options, root, parents }) => {
    if (parents.ec2.options.askConfirmation) {
      console.warn('!! I should ask for permissions here !!');
    }

    console.log('Creating instance with:');
    console.log(`  Name: ${options.name}`);
    console.log(`  CPU: ${options.cpuCount} vCPU`);
    console.log(`Current region: ${root.options.region}`);
    console.log(`Current identity: ${root.options.identity}`);

    console.log('Created!');
  },
});
