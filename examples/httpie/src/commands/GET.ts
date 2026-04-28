import { defineCommand } from '@parshjs/core';
import { requestOptions } from '../options.ts';

export const command = defineCommand('GET', {
  description: 'Send a GET request.',
  hidden: true,
  options: requestOptions,
});
