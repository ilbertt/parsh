import { defineRootCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineRootCommand({
  description: 'A fake AWS CLI.',
  options: {
    identity: {
      schema: z.string(),
      forwardToChildren: true,
      description: 'AWS account identity (required for every command).',
    },
    region: {
      schema: z.string().default('eu-west-2'),
      forwardToChildren: true,
      description: 'AWS region. Defaults to eu-west-2.',
      aliases: ['r'],
    },
  },
});
