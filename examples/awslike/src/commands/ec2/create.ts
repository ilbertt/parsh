import { defineCommand } from '@parshjs/core';
import { z } from 'zod';

const MIN_VCPU = 0.25;
const MAX_VCPU = 5;

export const command = defineCommand('ec2 create', {
  description: 'Create a new EC2 instance.',
  options: {
    name: { schema: z.string() },
    cpuCount: { schema: z.number().min(MIN_VCPU).max(MAX_VCPU) },
  },
  handler: ({ options, rootOptions, parents, print }) => {
    if (parents.ec2.options.askConfirmation) {
      print.warn('!! I should ask for permissions here !!');
    }

    print.info('Creating instance with:');
    print.info(`  Name: ${options.name}`);
    print.info(`  CPU: ${options.cpuCount} vCPU`);
    print.info(`Current region: ${rootOptions.region}`);
    print.info(`Current identity: ${rootOptions.identity}`);

    print.success('Created!');
  },
});
