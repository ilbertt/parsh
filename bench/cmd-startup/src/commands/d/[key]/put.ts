import { defineCommand } from '@repo/core';

export const command = defineCommand('d [key] put', {
  options: {},
  handler: (ctx) => {
    console.log(`d [key] put: `);
  },
});
