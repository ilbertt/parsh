import { defineCommand } from '@parshjs/core';
import { loadState, stateFile } from '../../state.ts';

export const command = defineCommand('tasks list', {
  description: 'List all tasks.',
  options: {},
  handler: ({ rootOptions, print }) => {
    const state = loadState(stateFile(rootOptions.stateFile));
    if (state.tasks.length === 0) {
      print.dim('No tasks. Add one with `pomo tasks add --title "..."`.');
      return;
    }
    for (const t of state.tasks) {
      print.info(`${t.done ? '✓' : '·'} ${t.id}  ${t.title}`);
    }
  },
});
