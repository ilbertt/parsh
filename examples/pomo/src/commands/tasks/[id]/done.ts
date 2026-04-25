import { defineCommand } from '@repo/core';
import { loadState, saveState, stateFile } from '../../../state.ts';

export const command = defineCommand('tasks [id] done', {
  description: 'Mark a task as done.',
  options: {},
  handler: (ctx) => {
    const id = ctx.parents['tasks [id]'].params.id;
    const path = stateFile(ctx.root.options.stateFile);
    const state = loadState(path);
    const task = state.tasks.find((t) => t.id === id);
    if (!task) {
      console.error(`No task with id ${id}`);
      process.exit(1);
    }
    task.done = true;
    saveState({ path, state });
    console.log(`✓ ${task.title}`);
  },
});
