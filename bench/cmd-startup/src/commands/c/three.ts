import { defineCommand } from '@repo/core';

export const command = defineCommand('c three', {
  options: {},
  handler: (ctx) => {
    console.log(`c three`);
  },
});
