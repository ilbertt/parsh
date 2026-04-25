import { defineCommand } from '@repo/core';
import { render } from 'ink';
import { createElement } from 'react';
import { z } from 'zod';
import { loadState, saveState, stateFile } from '../state.ts';
import { Timer } from '../ui/Timer.tsx';

const MIN_MINUTES = 1;
const MAX_MINUTES = 120;
const DEFAULT_MINUTES = 25;
const SECONDS_PER_MINUTE = 60;

export const command = defineCommand('start', {
  description: 'Start a pomodoro session with a live countdown.',
  options: {
    duration: z.coerce.number().min(MIN_MINUTES).max(MAX_MINUTES).default(DEFAULT_MINUTES),
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

    const totalSeconds = ctx.options.duration * SECONDS_PER_MINUTE;
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
