import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { type EmitOptions, emitGeneratedFile } from './emitter.js';
import { validateTree } from './validator.js';
import { walkCommandsDir } from './walker.js';

export interface GenerateOptions extends EmitOptions {
  commandsDir: string;
  outFile: string;
}

export async function generateCommandTree({
  commandsDir,
  outFile,
  coreModule,
  eager,
}: GenerateOptions): Promise<void> {
  const commandsDirAbs = resolve(commandsDir);
  const outFileAbs = resolve(outFile);

  const root = await walkCommandsDir({ commandsDir: commandsDirAbs, outFile: outFileAbs });
  const issues = validateTree(root);
  if (issues.length > 0) {
    const msg = issues.map((i) => `  - ${i.message}`).join('\n');
    throw new Error(`parsh: codegen validation failed:\n${msg}`);
  }

  const output = emitGeneratedFile({
    root,
    emitOptions: {
      ...(coreModule !== undefined ? { coreModule } : {}),
      ...(eager !== undefined ? { eager } : {}),
    },
  });
  await writeFile(outFileAbs, output, 'utf8');
}
