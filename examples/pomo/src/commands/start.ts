import { defineCommand } from '@repo/core';
import { render } from 'ink';
import { createElement } from 'react';
import { z } from 'zod';
import { loadState, saveState, stateFile } from '../state.ts';
import { Timer } from '../ui/Timer.tsx';

export const command = defineCommand('start', {
  description: 'Start a pomodoro session with a live countdown.',
  options: {
    duration: z.coerce.number().min(1).max(120).default(25),
    task: z.string().optional(),
  },
  handler: async (ctx) => {
    const path = stateFile(ctx.root.options.stateFile);
    const state = loadState(path);
    const task = ctx.options.task ? state.tasks.find((t) => t.id === ctx.options.task) : null;
    if (ctx.options.task && !task) {
      console.error(`No task with id ${ctx.options.task}`);
      process.exit(1);
    }

    const totalSeconds = ctx.options.duration * 60;
    const onDone = () => {
      state.sessions.push({
        startedAt: new Date().toISOString(),
        durationMinutes: ctx.options.duration,
        taskId: task?.id ?? null,
      });
      saveState({ path, state });
    };

    const { waitUntilExit } = render(
      createElement(Timer, { totalSeconds, taskTitle: task?.title ?? null, onDone }),
    );
    await waitUntilExit();
  },
});
