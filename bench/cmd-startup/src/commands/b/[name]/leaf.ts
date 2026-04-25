import { defineCommand } from '@repo/core';

export const command = defineCommand('b [name] leaf', {
  options: {},
  handler: (ctx) => {
    console.log(`b [name] leaf: `);
  },
});
