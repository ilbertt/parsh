import { defineCommand } from '@repo/core';

export const command = defineCommand('e', {
  options: {},
  handler: (ctx) => {
    console.log(`e`);
  },
});
