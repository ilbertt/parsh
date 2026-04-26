import { defineCommand } from '@repo/core';
import { loadState, saveState, stateFile } from '../../../state.ts';

export const command = defineCommand('tasks [id] remove', {
  description: 'Delete a task.',
  options: {},
  handler: ({ root, parents, print }) => {
    const id = parents['tasks [id]'].params.id;
    const path = stateFile(root.options.stateFile);
    const state = loadState(path);
    const before = state.tasks.length;
    state.tasks = state.tasks.filter((t) => t.id !== id);
    if (state.tasks.length === before) {
      print.error(`No task with id ${id}`);
      process.exit(1);
    }
    saveState({ path, state });
    print.success(`Removed ${id}`);
  },
});
