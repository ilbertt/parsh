import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('ec2 instances [id] stop', {
  description: 'Stop a running EC2 instance.',
  options: {
    force: z.boolean().optional(),
  },
  handler: (ctx) => {
    const id = ctx.parents['ec2 instances [id]'].params.id;
    const verb = ctx.options.force ? 'Force-stopping' : 'Stopping';
    console.log(`${verb} instance ${id} in ${ctx.root.options.region}`);
  },
});
