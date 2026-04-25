import { defineCommand } from '@repo/core';

export const command = defineCommand('status', {
  description: 'Show resolved configuration: env vars and on-disk credentials.',
  options: {},
  handler: async ({ root, env, files }) => {
    const creds = await files.credentials.maybeRead();
    console.log(`Identity:    ${root.options.identity}`);
    console.log(`Region:      ${root.options.region}`);
    console.log(`Profile:     ${env.AWSLIKE_PROFILE}`);
    console.log(`Debug:       ${env.AWSLIKE_DEBUG ? 'on' : 'off'}`);
    console.log(
      `Credentials: ${creds ? `configured (${files.credentials.path})` : 'not configured'}`,
    );
  },
});
