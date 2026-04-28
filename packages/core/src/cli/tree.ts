import { CommandLoadError } from '../errors/internal-errors.js';
import type { OptionsRecord, ParamsRecord } from '../schema.js';

export type TreeSegment =
  | { readonly kind: 'literal'; readonly value: string }
  | { readonly kind: 'param'; readonly name: string };

export interface LoadedCommand {
  options: OptionsRecord;
  params?: ParamsRecord;
  description?: string;
  hidden?: boolean;
  /** @default { enabled: true } */
  helpArg?: { enabled: boolean };
  // `any` is required so hand-built commands can use specific `ctx` shapes —
  // contravariance forbids the same with `unknown`. The real ctx type is
  // enforced at the `defineCommand` call site.
  // biome-ignore lint/suspicious/noExplicitAny: see note above
  handler?: (ctx: any) => void | Promise<void>;
  // biome-ignore lint/suspicious/noExplicitAny: see handler note above
  beforeHandler?: (ctx: any) => void | Promise<void>;
  // biome-ignore lint/suspicious/noExplicitAny: see handler note above
  afterHandler?: (ctx: any) => void | Promise<void>;
}

export interface RuntimeCommand {
  path: string;
  load: () => Promise<LoadedCommand>;
}

export interface RuntimeNode {
  segment: TreeSegment | null;
  command: RuntimeCommand | null;
  literalChildren: Record<string, RuntimeNode>;
  paramChild: RuntimeNode | null;
}

export interface Visited {
  command: RuntimeCommand | null;
  paramValue: string | null;
  paramName: string | null;
}

export interface WalkResult {
  node: RuntimeNode;
  visitedCommands: ReadonlyArray<Visited>;
  unknown: boolean;
  unknownToken: string | null;
}

export function walkTree({
  tree,
  positionals,
}: {
  tree: RuntimeNode;
  positionals: string[];
}): WalkResult {
  let node = tree;
  const visitedCommands: Visited[] = [];
  if (node.command) {
    visitedCommands.push({ command: node.command, paramValue: null, paramName: null });
  }
  for (const tok of positionals) {
    const literal = node.literalChildren[tok];
    if (literal) {
      node = literal;
      if (node.command) {
        visitedCommands.push({ command: node.command, paramValue: null, paramName: null });
      }
      continue;
    }
    if (node.paramChild) {
      node = node.paramChild;
      const paramName = node.segment?.kind === 'param' ? node.segment.name : null;
      visitedCommands.push({ command: node.command, paramValue: tok, paramName });
      continue;
    }
    return { node, visitedCommands, unknown: true, unknownToken: tok };
  }
  return { node, visitedCommands, unknown: false, unknownToken: null };
}

export async function loadCommand(cmd: RuntimeCommand): Promise<LoadedCommand> {
  try {
    return await cmd.load();
  } catch (cause) {
    throw new CommandLoadError({ path: cmd.path, cause });
  }
}

export async function loadDescendants(
  root: RuntimeNode,
): Promise<Map<RuntimeCommand, LoadedCommand>> {
  const out = new Map<RuntimeCommand, LoadedCommand>();
  const cmds: RuntimeCommand[] = [];
  function collect(node: RuntimeNode) {
    if (node.command) {
      cmds.push(node.command);
    }
    for (const child of Object.values(node.literalChildren)) {
      collect(child);
    }
    if (node.paramChild) {
      collect(node.paramChild);
    }
  }
  collect(root);
  await Promise.all(
    cmds.map(async (c) => {
      try {
        out.set(c, await loadCommand(c));
      } catch {
        // A failing child shouldn't block help — leave it out of the map and
        // the listing skips it.
      }
    }),
  );
  return out;
}
