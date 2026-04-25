import { defineCommand } from '@repo/core';

export const command = defineCommand('d [key] get', {
  options: {},
  handler: (ctx) => {
    console.log(`d [key] get: `);
  },
});
