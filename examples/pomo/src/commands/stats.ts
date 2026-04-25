import { defineCommand } from '@repo/core';
import { loadState, stateFile } from '../state.ts';

export const command = defineCommand('stats', {
  description: 'Show total pomodoro time and session count.',
  options: {},
  handler: ({ root }) => {
    const state = loadState(stateFile(root.options.stateFile));
    let total = 0;
    for (const s of state.sessions) {
      total += s.durationMinutes;
    }
    const today = new Date().toISOString().slice(0, 10);
    const todayCount = state.sessions.filter((s) => s.startedAt.startsWith(today)).length;

    console.log(`Sessions: ${state.sessions.length} (today: ${todayCount})`);
    console.log(`Total focus time: ${total} min`);
    console.log(`Open tasks: ${state.tasks.filter((t) => !t.done).length}`);
  },
});
