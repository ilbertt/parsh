import { defineCommand } from '@repo/core';

export const command = defineCommand('admin users', {
  options: {},
  handler: ({ parents }) => {
    console.log(`admin users role=${parents.admin.options.role}`);
  },
});
