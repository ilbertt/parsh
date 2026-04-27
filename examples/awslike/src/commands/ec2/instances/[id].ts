import { defineCommand } from '@parshjs/core';
import { z } from 'zod';

export const command = defineCommand('ec2 instances [id]', {
  description: 'Operate on a single EC2 instance.',
  params: { id: { schema: z.string() } },
  options: {},
});
