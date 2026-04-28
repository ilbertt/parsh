import { CommandLoadError } from '../errors/internal-errors.js';
import type { OptionsRecord, ParamsRecord } from '../schema.js';

export type TreeSegment =
  | { readonly kind: 'literal'; readonly value: string }
  | { readonly kind: 'param'; readonly name: string };

export function parsePathSegments(path: string): TreeSegment[] {
  if (!path) {
    return [];
  }
  return path.split(/\s+/).map((tok) => {
    if (tok.startsWith('[') && tok.endsWith(']')) {
      return { kind: 'param', name: tok.slice(1, -1) };
    }
    return { kind: 'literal', value: tok };
  });
}

/**
 * Reconstruct a display-friendly path string from the walk's positionals,
 * substituting param values with their `<name>` placeholders. The path string
 * for routing-only nodes (which have no `command` to read `path` from) comes
 * from here.
 */
export function displayPathFor({
  tree,
  positionals,
}: {
  tree: RuntimeNode;
  positionals: ReadonlyArray<string>;
}): string[] {
  const out: string[] = [];
  let node: RuntimeNode = tree;
  for (const tok of positionals) {
    const literal = node.literalChildren[tok];
    if (literal) {
      const seg = literal.segment;
      if (seg && seg.kind === 'literal') {
        out.push(seg.value);
      }
      node = literal;
      continue;
    }
    if (node.paramChild) {
      const seg = node.paramChild.segment;
      if (seg && seg.kind === 'param') {
        out.push(`<${seg.name}>`);
      }
      node = node.paramChild;
      continue;
    }
    break;
  }
  return out;
}

export interface LoadedCommand {
  options: OptionsRecord;
  params?: ParamsRecord;
  description?: string;
  hidden?: boolean;
  /**
   * If set, this command is an alias — running it forwards to the command at
   * the given path string. Aliases have no `options`, `params`, `handler`, or
   * lifecycle hooks; the type system enforces this at the `defineCommand` call
   * site. Resolution and dispatch live in the runtime, not codegen.
   */
  aliasOf?: string;
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
