import { defineCommand } from '@repo/core';

export const command = defineCommand('serve', {
  description: 'Start the (pretend) HTTP server using validated env vars.',
  options: {},
  handler: ({ context, print }) => {
    print.info(`PORT      = ${context.env.PORT}`);
    print.info(`NODE_ENV  = ${context.env.NODE_ENV}`);
    print.info(`DB        = ${context.env.DATABASE_URL}`);
    print.success('Listening… (demo only)');
  },
});
