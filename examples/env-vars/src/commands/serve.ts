import { defineCommand } from '@repo/core';

export const command = defineCommand('serve', {
  description: 'Start the (pretend) HTTP server using validated env vars.',
  options: {},
  handler: ({ env }) => {
    console.log(`PORT      = ${env.PORT}`);
    console.log(`NODE_ENV  = ${env.NODE_ENV}`);
    console.log(`DB        = ${env.DATABASE_URL}`);
    console.log('Listening… (demo only)');
  },
});
