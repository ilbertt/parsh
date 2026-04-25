import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('ec2', {
  description: 'Manage EC2 instances.',
  options: {
    askConfirmation: z.boolean().optional(),
  },
  handler: ({ root }) => {
    console.log(`Manage EC2 instances. Current identity: ${root.options.identity}`);
  },
});
