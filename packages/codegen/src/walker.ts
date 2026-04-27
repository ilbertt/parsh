import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { extractCommand, extractRootCommand } from './extractor.js';
import type { CommandNode, SourceSegment } from './types.js';

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

function emptyNode({
  segment,
  path,
}: {
  segment: SourceSegment | null;
  path: string[];
}): CommandNode {
  return {
    segment,
    command: null,
    literalChildren: new Map(),
    paramChild: null,
    path,
  };
}

function attachToNode({
  parent,
  segment,
}: {
  parent: CommandNode;
  segment: SourceSegment;
}): CommandNode {
  const key = segmentKey(segment);
  if (segment.kind === 'param') {
    if (parent.paramChild) {
      const existingName =
        parent.paramChild.segment?.kind === 'param' ? parent.paramChild.segment.name : null;
      if (existingName !== segment.name) {
        throw new Error(
          `parsh: two param siblings in the same directory — '[${existingName}]' and '[${segment.name}]' under ${parent.path.join('/') || '<root>'}`,
        );
      }
      return parent.paramChild;
    }
    const node = emptyNode({ segment, path: [...parent.path, key] });
    parent.paramChild = node;
    return node;
  }
  const existing = parent.literalChildren.get(key);
  if (existing) {
    return existing;
  }
  const node = emptyNode({ segment, path: [...parent.path, key] });
  parent.literalChildren.set(key, node);
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

async function attachCommandFile({
  dirAbs,
  filename,
  node,
  outDir,
}: {
  dirAbs: string;
  filename: string;
  node: CommandNode;
  outDir: string;
}): Promise<void> {
  const basename = filename.replace(/\.ts$/, '');
  const fileSegment = dirNameToSegment(basename);
  const extracted = await extractCommand({
    filePath: join(dirAbs, filename),
    expectedSegments: [...node.path.map(parseSegmentKey), fileSegment],
    outDir,
  });
  const target = attachToNode({ parent: node, segment: fileSegment });
  if (target.command) {
    throw new Error(
      `parsh: duplicate command at path '${target.path.join(' ')}' — both ${target.command.filePath} and ${extracted.filePath}`,
    );
  }
  target.command = extracted;
}

export async function walkCommandsDir({
  commandsDir,
  outFile,
}: {
  commandsDir: string;
  outFile: string;
}): Promise<CommandNode> {
  const root = emptyNode({ segment: null, path: [] });
  const outDir = outFile.replace(/[^/]+$/, '');

  async function visit({ dirAbs, node }: { dirAbs: string; node: CommandNode }): Promise<void> {
    const contents = await readDirContents(dirAbs);
    if (!contents) {
      return;
    }

    for (const filename of contents.commandFiles) {
      await attachCommandFile({ dirAbs, filename, node, outDir });
    }

    for (const dirname of contents.subdirs) {
      const child = attachToNode({ parent: node, segment: dirNameToSegment(dirname) });
      await visit({ dirAbs: join(dirAbs, dirname), node: child });
    }
  }

  await visit({ dirAbs: commandsDir, node: root });

  const rootFilePath = join(commandsDir, ROOT_FILE);
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
