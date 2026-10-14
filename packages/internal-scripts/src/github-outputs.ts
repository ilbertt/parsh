import { appendFile } from 'node:fs/promises';

export async function writeGithubOutputs(values: Record<string, string>) {
  const { GITHUB_OUTPUT: output } = process.env;
  if (output) {
    await appendFile(
      output,
      Object.entries(values)
        .map(([key, value]) => `${key}=${value}\n`)
        .join(''),
    );
  }
}
