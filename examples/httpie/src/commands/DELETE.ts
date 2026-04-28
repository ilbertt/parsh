import { defineCommand } from '@parshjs/core';
import { requestOptions } from '../options.ts';

export const command = defineCommand('DELETE', {
  description: 'Send a DELETE request.',
  hidden: true,
  options: requestOptions,
});
