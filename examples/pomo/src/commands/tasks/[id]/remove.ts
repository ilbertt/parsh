import { defineCommand } from '@repo/core';
import { loadState, saveState, stateFile } from '../../../state.ts';

export const command = defineCommand('tasks [id] remove', {
  description: 'Delete a task.',
  options: {},
  handler: (ctx) => {
    const id = ctx.parents['tasks [id]'].params.id;
    const path = stateFile(ctx.root.options.stateFile);
    const state = loadState(path);
    const before = state.tasks.length;
    state.tasks = state.tasks.filter((t) => t.id !== id);
    if (state.tasks.length === before) {
      console.error(`No task with id ${id}`);
      process.exit(1);
    }
    saveState({ path, state });
    console.log(`Removed ${id}`);
  },
});
