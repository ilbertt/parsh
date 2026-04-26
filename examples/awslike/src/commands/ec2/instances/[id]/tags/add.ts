import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('ec2 instances [id] tags add', {
  description: 'Add a tag to an EC2 instance.',
  options: {
    key: { schema: z.string() },
    value: { schema: z.string() },
  },
  handler: ({ parents, options, rootOptions, print }) => {
    const id = parents['ec2 instances [id]'].params.id;
    print.info(`Tagging ${id} with ${options.key}=${options.value} in ${rootOptions.region}`);
  },
});
