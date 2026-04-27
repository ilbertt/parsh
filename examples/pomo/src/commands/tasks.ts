import { defineCommand } from '@parshjs/core';

export const command = defineCommand('tasks', {
  description: 'Manage pomodoro tasks.',
  options: {},
  handler: ({ print }) => {
    print.info('Use `pomo tasks list`, `pomo tasks add`, or `pomo tasks <id> done`.');
  },
});
