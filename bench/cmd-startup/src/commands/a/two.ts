import { defineCommand } from '@repo/core';

export const command = defineCommand('a two', {
  options: {},
  handler: (ctx) => {
    console.log(`a two`);
  },
});
