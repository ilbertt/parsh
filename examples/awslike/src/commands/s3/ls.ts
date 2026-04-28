import { defineCommand } from '@parshjs/core';

export const command = defineCommand('s3 ls', {
  aliasOf: 's3 buckets list',
});
