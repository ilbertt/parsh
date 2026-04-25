import { defineCommand } from '@repo/core';
import { templateNames, templates } from '../../templates.ts';

export const command = defineCommand('templates list', {
  description: 'List available templates.',
  options: {},
  handler: () => {
    for (const n of templateNames) {
      console.log(`${n.padEnd(8)} ${templates[n].description}`);
    }
  },
});
