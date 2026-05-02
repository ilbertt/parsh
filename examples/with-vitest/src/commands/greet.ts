import { defineCommand } from '@parshjs/core';
import z from 'zod';
import { BlankNameError } from '../errors.ts';

const QUIET_HOURS_START = 22;
const QUIET_HOURS_END = 5;
const NOON = 12;
const EVENING = 18;

export const command = defineCommand('greet', {
  description: 'Print a time-aware greeting.',
  options: {
    name: { schema: z.string(), required: true },
    shout: { schema: z.boolean().default(false) },
  },
  beforeHandler: ({ context, print }) => {
    const hour = context.clock().getHours();
    if (hour < QUIET_HOURS_END || hour >= QUIET_HOURS_START) {
      print.warn('quiet hours — keeping it short');
    }
  },
  handler: ({ options, context, print }) => {
    if (options.name.trim() === '') {
      throw new BlankNameError();
    }
    const hour = context.clock().getHours();
    const part = hour < NOON ? 'morning' : hour < EVENING ? 'afternoon' : 'evening';
    const message = `good ${part}, ${options.name}`;
    print.success(options.shout ? message.toUpperCase() : message);
  },
  afterHandler: ({ print }) => {
    print.dim('done');
  },
});
