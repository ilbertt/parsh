import { defineCommand } from '@parshjs/core';
import { z } from 'zod';

export const command = defineCommand('ec2 instances [id] tags set [key] [value]', {
  description: 'Set a tag on an EC2 instance via positional key and value.',
  params: { value: { schema: z.string() } },
  options: {},
  handler: ({ params, parents, rootOptions, print }) => {
    const id = parents['ec2 instances [id]'].params.id;
    const key = parents['ec2 instances [id] tags set [key]'].params.key;
    print.info(`Tagging ${id} with ${key}=${params.value} in ${rootOptions.region}`);
  },
});
