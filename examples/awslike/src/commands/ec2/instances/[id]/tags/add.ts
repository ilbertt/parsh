import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('ec2 instances [id] tags add', {
  description: 'Add a tag to an EC2 instance.',
  options: {
    key: z.string(),
    value: z.string(),
  },
  handler: (ctx) => {
    const id = ctx.parents['ec2 instances [id]'].params.id;
    console.log(
      `Tagging ${id} with ${ctx.options.key}=${ctx.options.value} in ${ctx.root.options.region}`,
    );
  },
});
