import { defineCommand } from '@repo/core';

export const command = defineCommand('admin users', {
  options: {},
  handler: (ctx) => {
    console.log(`admin users role=${ctx.parents.admin.options.role}`);
  },
});
