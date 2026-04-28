import { defineCommand } from '@parshjs/core';
import { requestOptions } from '../options.ts';

export const command = defineCommand('HEAD', {
  description: 'Send a HEAD request.',
  hidden: true,
  options: requestOptions,
});
