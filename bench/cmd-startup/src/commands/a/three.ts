import { defineCommand } from '@repo/core';

export const command = defineCommand('a three', {
  options: {},
  handler: (ctx) => {
    console.log(`a three`);
  },
});
