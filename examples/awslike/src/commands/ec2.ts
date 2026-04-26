import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('ec2', {
  description: 'Manage EC2 instances.',
  options: {
    askConfirmation: {
      schema: z.boolean().optional(),
      forwardToChildren: true,
      description: 'Prompt before destructive EC2 operations.',
    },
  },
  handler: ({ root, print }) => {
    print.info(`Manage EC2 instances. Current identity: ${root.options.identity}`);
  },
});
