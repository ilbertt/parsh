import { defineCommand } from '@repo/core';
import { loadState, stateFile } from '../../state.ts';

export const command = defineCommand('tasks list', {
  description: 'List all tasks.',
  options: {},
  handler: ({ root }) => {
    const state = loadState(stateFile(root.options.stateFile));
    if (state.tasks.length === 0) {
      console.log('No tasks. Add one with `pomo tasks add --title "..."`.');
      return;
    }
    for (const t of state.tasks) {
      console.log(`${t.done ? '✓' : '·'} ${t.id}  ${t.title}`);
    }
  },
});
