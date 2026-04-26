import { defineCommand } from '@repo/core';

export const command = defineCommand('status', {
  description: 'Show resolved configuration: env vars and on-disk credentials.',
  options: {},
  handler: async ({ root, context, print }) => {
    const creds = await context.files.credentials.maybeRead();
    print.info(`Identity:    ${root.options.identity}`);
    print.info(`Region:      ${root.options.region}`);
    print.info(`Profile:     ${context.env.AWSLIKE_PROFILE}`);
    print.info(`Debug:       ${context.env.AWSLIKE_DEBUG ? 'on' : 'off'}`);
    if (creds) {
      print.success(`Credentials: configured (${context.files.credentials.path})`);
    } else {
      print.warn('Credentials: not configured');
    }
  },
});
