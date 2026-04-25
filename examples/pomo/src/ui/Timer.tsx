import { Box, Text, useApp } from 'ink';
import { useEffect, useState } from 'react';

type Props = {
  totalSeconds: number;
  taskTitle: string | null;
  onDone: () => void;
};

const fmt = (s: number) => {
  const m = Math.floor(s / 60)
    .toString()
    .padStart(2, '0');
  const r = (s % 60).toString().padStart(2, '0');
  return `${m}:${r}`;
};

export const Timer = ({ totalSeconds, taskTitle, onDone }: Props) => {
  const { exit } = useApp();
  const [remaining, setRemaining] = useState(totalSeconds);

  useEffect(() => {
    if (remaining <= 0) {
      onDone();
      exit();
      return;
    }
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining, onDone, exit]);

  const pct = 1 - remaining / totalSeconds;
  const width = 30;
  const filled = Math.round(pct * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);

  return (
    <Box flexDirection="column" paddingY={1} paddingX={2}>
      <Text bold color="red">
        🍅 Pomodoro
      </Text>
      <Text dimColor>{taskTitle ?? 'No task selected'}</Text>
      <Box marginTop={1}>
        <Text color="cyan">{bar}</Text>
        <Text> {fmt(remaining)}</Text>
      </Box>
      <Text dimColor>Ctrl+C to abort</Text>
    </Box>
  );
};
