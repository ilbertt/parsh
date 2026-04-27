import { defineCommand } from '@parshjs/core';
import { z } from 'zod';

export const command = defineCommand('ec2 instances [id] tags set [key]', {
  params: { key: { schema: z.string() } },
  options: {},
  hidden: true,
});
