import { defineCommand } from '@repo/core';

export const command = defineCommand('b three', {
  options: {},
  handler: (ctx) => {
    console.log(`b three`);
  },
});
