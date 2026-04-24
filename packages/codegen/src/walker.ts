import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { extractCommand, extractRootCommand } from '#extractor.ts';
import type { CommandNode, SourceSegment } from '#types.ts';

const ROOT_FILE = '_root.ts';

function dirNameToSegment(name: string): SourceSegment {
  if (name.startsWith('[') && name.endsWith(']')) {
    return { kind: 'param', name: name.slice(1, -1) };
  }
  return { kind: 'literal', value: name };
}

function isCommandFile(filename: string): boolean {
  if (!filename.endsWith('.ts')) {
    return false;
  }
  if (filename.startsWith('_')) {
    return false;
  }
  if (filename.endsWith('.test.ts') || filename.endsWith('.gen.ts')) {
    return false;
  }
  return true;
}

function segmentKey(seg: SourceSegment): string {
  return seg.kind === 'literal' ? seg.value : `[${seg.name}]`;
}

function parseSegmentKey(key: string): SourceSegment {
  if (key.startsWith('[') && key.endsWith(']')) {
    return { kind: 'param', name: key.slice(1, -1) };
  }
  return { kind: 'literal', value: key };
}

function emptyNode(opts: { segment: SourceSegment | null; path: string[] }): CommandNode {
  return {
    segment: opts.segment,
    command: null,
    literalChildren: new Map(),
    paramChild: null,
    path: opts.path,
  };
}

function attachToNode(opts: { parent: CommandNode; segment: SourceSegment }): CommandNode {
  const key = segmentKey(opts.segment);
  if (opts.segment.kind === 'param') {
    if (opts.parent.paramChild) {
      const existingName =
        opts.parent.paramChild.segment?.kind === 'param'
          ? opts.parent.paramChild.segment.name
          : null;
      if (existingName !== opts.segment.name) {
        throw new Error(
          `parsh: two param siblings in the same directory — '[${existingName}]' and '[${opts.segment.name}]' under ${opts.parent.path.join('/') || '<root>'}`,
        );
      }
      return opts.parent.paramChild;
    }
    const node = emptyNode({
      segment: opts.segment,
      path: [...opts.parent.path, key],
    });
    opts.parent.paramChild = node;
    return node;
  }
  const existing = opts.parent.literalChildren.get(key);
  if (existing) {
    return existing;
  }
  const node = emptyNode({
    segment: opts.segment,
    path: [...opts.parent.path, key],
  });
  opts.parent.literalChildren.set(key, node);
  return node;
}

interface DirContents {
  subdirs: string[];
  commandFiles: string[];
}

async function readDirContents(dirAbs: string): Promise<DirContents | null> {
  let entries: string[];
  try {
    entries = await readdir(dirAbs);
  } catch {
    return null;
  }
  entries.sort();

  const subdirs: string[] = [];
  const commandFiles: string[] = [];
  for (const name of entries) {
    if (name.startsWith('_')) {
      continue;
    }
    const st = await stat(join(dirAbs, name));
    if (st.isDirectory()) {
      subdirs.push(name);
    } else if (st.isFile() && isCommandFile(name)) {
      commandFiles.push(name);
    }
  }
  return { subdirs, commandFiles };
}

async function attachCommandFile(opts: {
  dirAbs: string;
  filename: string;
  node: CommandNode;
  outDir: string;
}): Promise<void> {
  const basename = opts.filename.replace(/\.ts$/, '');
  const fileSegment = dirNameToSegment(basename);
  const extracted = await extractCommand({
    filePath: join(opts.dirAbs, opts.filename),
    expectedSegments: [...opts.node.path.map(parseSegmentKey), fileSegment],
    outDir: opts.outDir,
  });
  const target = attachToNode({ parent: opts.node, segment: fileSegment });
  if (target.command) {
    throw new Error(
      `parsh: duplicate command at path '${target.path.join(' ')}' — both ${target.command.filePath} and ${extracted.filePath}`,
    );
  }
  target.command = extracted;
}

export async function walkCommandsDir(opts: {
  commandsDir: string;
  outFile: string;
}): Promise<CommandNode> {
  const root = emptyNode({ segment: null, path: [] });
  const outDir = opts.outFile.replace(/[^/]+$/, '');

  async function visit(input: { dirAbs: string; node: CommandNode }): Promise<void> {
    const contents = await readDirContents(input.dirAbs);
    if (!contents) {
      return;
    }

    for (const filename of contents.commandFiles) {
      await attachCommandFile({
        dirAbs: input.dirAbs,
        filename,
        node: input.node,
        outDir,
      });
    }

    for (const dirname of contents.subdirs) {
      const child = attachToNode({ parent: input.node, segment: dirNameToSegment(dirname) });
      await visit({ dirAbs: join(input.dirAbs, dirname), node: child });
    }
  }

  await visit({ dirAbs: opts.commandsDir, node: root });

  const rootFilePath = join(opts.commandsDir, ROOT_FILE);
  try {
    const st = await stat(rootFilePath);
    if (st.isFile()) {
      root.command = await extractRootCommand({ filePath: rootFilePath, outDir });
    }
  } catch {
    // no _root.ts — fine
  }

  return root;
}
