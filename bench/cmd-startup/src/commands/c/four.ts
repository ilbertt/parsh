import { defineCommand } from '@repo/core';

export const command = defineCommand('c four', {
  options: {},
  handler: (ctx) => {
    console.log(`c four`);
  },
});
