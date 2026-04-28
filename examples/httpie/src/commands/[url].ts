import { defineCommand } from '@parshjs/core';

export const command = defineCommand('[url]', {
  aliasOf: 'GET [url]',
});
