import { defineCommand } from '@parshjs/core';

export const command = defineCommand('s3 c [name]', {
  aliasOf: 's3 buckets [name] create',
});
