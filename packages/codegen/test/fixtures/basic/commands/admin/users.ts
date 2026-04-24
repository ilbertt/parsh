import { defineCommand } from '@parsh/core';

export const args = {};

export const command = defineCommand('admin users', {
  args,
  handler: (ctx) => {
    console.log(`admin users role=${ctx.args.role}`);
  },
});
