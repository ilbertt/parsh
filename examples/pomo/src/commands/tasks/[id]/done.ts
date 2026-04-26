import { defineCommand } from '@repo/core';
import { loadState, saveState, stateFile } from '../../../state.ts';

export const command = defineCommand('tasks [id] done', {
  description: 'Mark a task as done.',
  options: {},
  handler: ({ rootOptions, parents, print }) => {
    const id = parents['tasks [id]'].params.id;
    const path = stateFile(rootOptions.stateFile);
    const state = loadState(path);
    const task = state.tasks.find((t) => t.id === id);
    if (!task) {
      print.error(`No task with id ${id}`);
      process.exit(1);
    }
    task.done = true;
    saveState({ path, state });
    print.success(`✓ ${task.title}`);
  },
});
