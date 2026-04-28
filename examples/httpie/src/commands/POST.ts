import { defineCommand } from '@parshjs/core';
import { dataOption, requestOptions } from '../options.ts';

export const command = defineCommand('POST', {
  description: 'Send a POST request.',
  hidden: true,
  options: { ...requestOptions, ...dataOption },
});
