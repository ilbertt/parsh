import { defineCommand } from '#index.ts';

console.log('LOADED:beta/leaf');

export const command = defineCommand('beta leaf', {
  options: {},
  handler: () => {
    console.log('beta-leaf');
  },
});
