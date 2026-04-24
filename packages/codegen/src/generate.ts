import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { type EmitOptions, emitGeneratedFile } from '#emitter.ts';
import { validateTree } from '#validator.ts';
import { walkCommandsDir } from '#walker.ts';

export interface GenerateOptions extends EmitOptions {
  commandsDir: string;
  outFile: string;
}

export async function generateCommandTree(opts: GenerateOptions): Promise<void> {
  const commandsDir = resolve(opts.commandsDir);
  const outFile = resolve(opts.outFile);

  const root = await walkCommandsDir({ commandsDir, outFile });
  const issues = validateTree(root);
  if (issues.length > 0) {
    const msg = issues.map((i) => `  - ${i.message}`).join('\n');
    throw new Error(`parsh: codegen validation failed:\n${msg}`);
  }

  const output = emitGeneratedFile({
    root,
    emitOptions: {
      ...(opts.rootOptionsTypeExpr !== undefined
        ? { rootOptionsTypeExpr: opts.rootOptionsTypeExpr }
        : {}),
      ...(opts.coreModule !== undefined ? { coreModule: opts.coreModule } : {}),
    },
  });
  await writeFile(outFile, output, 'utf8');
}
