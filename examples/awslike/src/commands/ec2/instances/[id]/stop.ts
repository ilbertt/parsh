import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('ec2 instances [id] stop', {
  description: 'Stop a running EC2 instance.',
  options: {
    force: { schema: z.boolean().optional() },
  },
  handler: ({ parents, options, root }) => {
    const id = parents['ec2 instances [id]'].params.id;
    const verb = options.force ? 'Force-stopping' : 'Stopping';
    console.log(`${verb} instance ${id} in ${root.options.region}`);
  },
});
