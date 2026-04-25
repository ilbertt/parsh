#!/usr/bin/env bun
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const HERE = import.meta.dir;
const COMMANDS_DIR = join(HERE, 'commands');

const COMMAND_PATHS: ReadonlyArray<string> = [
  'a',
  'a/one',
  'a/two',
  'a/three',
  'a/four',
  'a/five',
  'a/[id]',
  'a/[id]/inner',
  'b',
  'b/one',
  'b/two',
  'b/three',
  'b/four',
  'b/five',
  'b/[name]',
  'b/[name]/leaf',
  'c',
  'c/one',
  'c/two',
  'c/three',
  'c/four',
  'd',
  'd/one',
  'd/two',
  'd/[key]',
  'd/[key]/get',
  'd/[key]/put',
  'e',
  'e/one',
  'e/two',
];

function pathStringFor(rel: string): string {
  return rel.split('/').join(' ');
}

function isDynamic(seg: string): boolean {
  return seg.startsWith('[') && seg.endsWith(']');
}

function paramSegmentsOf(rel: string): string[] {
  return rel
    .split('/')
    .filter(isDynamic)
    .map((s) => s.slice(1, -1));
}

function ownParamOf(rel: string): string | null {
  const last = rel.split('/').pop()!;
  return isDynamic(last) ? last.slice(1, -1) : null;
}

function fileFor(rel: string): string {
  const pathString = pathStringFor(rel);
  const own = ownParamOf(rel);
  const params = paramSegmentsOf(rel);
  const ancestorParams = own ? params.slice(0, -1) : params;

  const lines: string[] = [];
  lines.push(`import { defineCommand } from '@repo/core';`);
  if (own) {
    lines.push(`import { z } from 'zod';`);
  }
  lines.push('');
  lines.push(`export const command = defineCommand('${pathString}', {`);
  if (own) {
    lines.push(`  params: { ${own}: z.string() },`);
  }
  lines.push('  options: {},');
  lines.push('  handler: (ctx) => {');
  if (ancestorParams.length > 0 || own) {
    const refs = [...(own ? [`own=\${ctx.params.${own}}`] : [])].join(' ');
    lines.push(`    console.log(\`${pathString}: ${refs}\`);`);
  } else {
    lines.push(`    console.log(\`${pathString}\`);`);
  }
  lines.push('  },');
  lines.push('});');
  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  await rm(COMMANDS_DIR, { recursive: true, force: true });
  for (const rel of COMMAND_PATHS) {
    const filePath = join(COMMANDS_DIR, `${rel}.ts`);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, fileFor(rel), 'utf8');
  }
  await writeFile(
    join(COMMANDS_DIR, '_root.ts'),
    `import { defineRootCommand } from '@repo/core';\nimport { z } from 'zod';\n\nexport const command = defineRootCommand({\n  options: { quiet: z.boolean().optional() },\n});\n`,
    'utf8',
  );
  console.log(`wrote ${COMMAND_PATHS.length + 1} command files to ${COMMANDS_DIR}`);
}

await main();
