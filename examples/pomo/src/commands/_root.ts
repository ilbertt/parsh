import { defineRootCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineRootCommand({
  description: 'A pomodoro timer with a live Ink countdown.',
  options: {
    stateFile: z.string().optional(),
  },
});
