import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('ec2', {
  description: 'Manage EC2 instances.',
  options: {
    askConfirmation: z.boolean().optional(),
  },
  handler: (ctx) => {
    console.log(`Manage EC2 instances. Current identity: ${ctx.root.options.identity}`);
  },
});
