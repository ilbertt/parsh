import { defineCommand } from '@repo/core';

export const command = defineCommand('b five', {
  options: {},
  handler: (ctx) => {
    console.log(`b five`);
  },
});
