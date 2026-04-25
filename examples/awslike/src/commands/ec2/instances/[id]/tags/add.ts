import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('ec2 instances [id] tags add', {
  description: 'Add a tag to an EC2 instance.',
  options: {
    key: z.string(),
    value: z.string(),
  },
  handler: ({ parents, options, root }) => {
    const id = parents['ec2 instances [id]'].params.id;
    console.log(`Tagging ${id} with ${options.key}=${options.value} in ${root.options.region}`);
  },
});
