import { defineCommand } from '@repo/core';
import { z } from 'zod';
import { loadState, newId, saveState, stateFile } from '../../state.ts';

export const command = defineCommand('tasks add', {
  description: 'Add a new task.',
  options: {
    title: z.string().min(1),
  },
  handler: (ctx) => {
    const path = stateFile(ctx.root.options.stateFile);
    const state = loadState(path);
    const task = { id: newId(), title: ctx.options.title, done: false };
    state.tasks.push(task);
    saveState({ path, state });
    console.log(`Added ${task.id}: ${task.title}`);
  },
});
