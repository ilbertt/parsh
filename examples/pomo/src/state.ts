import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type Task = { id: string; title: string; done: boolean };
export type Session = { startedAt: string; durationMinutes: number; taskId: string | null };
export type State = { tasks: Task[]; sessions: Session[] };

const DEFAULT_PATH = join(homedir(), '.pomo-example.json');

const empty: State = { tasks: [], sessions: [] };

export const stateFile = (override: string | undefined) => override ?? DEFAULT_PATH;

export const loadState = (path: string): State => {
  if (!existsSync(path)) {
    return structuredClone(empty);
  }
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw) as State;
};

export const saveState = ({ path, state }: { path: string; state: State }) => {
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
};

const ID_RADIX = 36;
const ID_START = 2;
const ID_END = 8;

export const newId = () => Math.random().toString(ID_RADIX).slice(ID_START, ID_END);
