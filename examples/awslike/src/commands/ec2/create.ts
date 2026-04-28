import { defineCommand } from '@parshjs/core';
import { z } from 'zod';
import { InvalidRegion, NotAuthorized } from '../../errors.ts';

const MIN_VCPU = 0.25;
const MAX_VCPU = 5;
const VALID_REGIONS = new Set(['eu-west-1', 'eu-west-2', 'us-east-1', 'us-west-2']);

export const command = defineCommand('ec2 create', {
  description: 'Create a new EC2 instance.',
  options: {
    name: { schema: z.string() },
    cpuCount: { schema: z.number().min(MIN_VCPU).max(MAX_VCPU) },
  },
  handler: ({ options, rootOptions, parents, print }) => {
    if (rootOptions.identity === 'guest') {
      throw new NotAuthorized(rootOptions.identity);
    }
    if (!VALID_REGIONS.has(rootOptions.region)) {
      throw new InvalidRegion(rootOptions.region);
    }

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
