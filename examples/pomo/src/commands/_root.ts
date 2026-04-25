import { defineRootCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineRootCommand({
  description: 'A pomodoro timer with a live Ink countdown.',
  options: {
    stateFile: {
      schema: z.string().optional(),
      forwardToChildren: true,
      description: 'Path to the JSON file backing tasks and sessions.',
    },
  },
});
