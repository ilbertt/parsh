import { defineCommand } from '@repo/core';

export const command = defineCommand('serve', {
  description: 'Start the (pretend) HTTP server using validated env vars.',
  options: {},
  handler: ({ env, print }) => {
    print.info(`PORT      = ${env.PORT}`);
    print.info(`NODE_ENV  = ${env.NODE_ENV}`);
    print.info(`DB        = ${env.DATABASE_URL}`);
    print.success('Listening… (demo only)');
  },
});
