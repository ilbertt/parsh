import { defineCommand } from '@repo/core';

export const command = defineCommand('a [id] inner', {
  options: {},
  handler: (ctx) => {
    console.log(`a [id] inner: `);
  },
});
