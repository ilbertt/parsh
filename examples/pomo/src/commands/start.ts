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
    duration: {
      schema: z.coerce.number().min(MIN_MINUTES).max(MAX_MINUTES).default(DEFAULT_MINUTES),
    },
    task: { schema: z.string().optional() },
  },
  handler: async ({ options, root }) => {
    const path = stateFile(root.options.stateFile);
    const state = loadState(path);
    const task = options.task ? state.tasks.find((t) => t.id === options.task) : null;
    if (options.task && !task) {
      console.error(`No task with id ${options.task}`);
      process.exit(1);
    }

    const totalSeconds = options.duration * SECONDS_PER_MINUTE;
    const onDone = () => {
      state.sessions.push({
        startedAt: new Date().toISOString(),
        durationMinutes: options.duration,
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
