import { defineCommand } from '@repo/core';

export const command = defineCommand('admin users', {
  args: {},
  handler: (ctx) => {
    console.log(`admin users role=${ctx.parents.admin.args.role}`);
  },
});
