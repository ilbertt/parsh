// biome-ignore lint/style/useFilenamingConvention: keep uppercase

import { defineCommand } from '@parshjs/core';
import { dataOption, requestOptions } from '../options.ts';

export const command = defineCommand('PATCH', {
  description: 'Send a PATCH request.',
  hidden: true,
  options: { ...requestOptions, ...dataOption },
});
