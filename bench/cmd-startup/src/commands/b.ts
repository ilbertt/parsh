import { defineCommand } from '@repo/core';

export const command = defineCommand('b', {
  options: {},
  handler: (ctx) => {
    console.log(`b`);
  },
});
