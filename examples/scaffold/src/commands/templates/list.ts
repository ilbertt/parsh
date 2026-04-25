import { defineCommand } from '@repo/core';
import { templateNames, templates } from '../../templates.ts';

const NAME_COL_WIDTH = 8;

export const command = defineCommand('templates list', {
  description: 'List available templates.',
  options: {},
  handler: () => {
    for (const n of templateNames) {
      console.log(`${n.padEnd(NAME_COL_WIDTH)} ${templates[n].description}`);
    }
  },
});
