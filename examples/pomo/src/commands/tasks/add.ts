import { defineCommand } from '@repo/core';
import { z } from 'zod';
import { loadState, newId, saveState, stateFile } from '../../state.ts';

export const command = defineCommand('tasks add', {
  description: 'Add a new task.',
  options: {
    title: { schema: z.string().min(1) },
  },
  handler: ({ options, rootOptions, print }) => {
    const path = stateFile(rootOptions.stateFile);
    const state = loadState(path);
    const task = { id: newId(), title: options.title, done: false };
    state.tasks.push(task);
    saveState({ path, state });
    print.success(`Added ${task.id}: ${task.title}`);
  },
});
