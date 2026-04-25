import { defineCommand } from '@repo/core';

export const command = defineCommand('a five', {
  options: {},
  handler: (ctx) => {
    console.log(`a five`);
  },
});
