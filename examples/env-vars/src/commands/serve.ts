import { defineCommand } from '@repo/core';

export const command = defineCommand('serve', {
  description: 'Start the (pretend) HTTP server using validated env vars.',
  options: {},
  handler: async (ctx) => {
    console.log(`PORT      = ${ctx.env.PORT}`);
    console.log(`NODE_ENV  = ${ctx.env.NODE_ENV}`);
    console.log(`DB        = ${ctx.env.DATABASE_URL}`);
    console.log('Listening… (demo only)');
  },
});
