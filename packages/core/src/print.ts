import { stderrRed, stderrYellow, stdoutDim, stdoutGreen } from './style.js';

export interface Print {
  info: (message: string) => void;
  success: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
  dim: (message: string) => void;
}

export const print: Print = {
  info: (message) => process.stdout.write(`${message}\n`),
  success: (message) => process.stdout.write(`${stdoutGreen(message)}\n`),
  warn: (message) => process.stderr.write(`${stderrYellow(message)}\n`),
  error: (message) => process.stderr.write(`${stderrRed(message)}\n`),
  dim: (message) => process.stdout.write(`${stdoutDim(message)}\n`),
};
