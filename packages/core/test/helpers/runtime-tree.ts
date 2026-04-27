import type { LoadedCommand, OptionMeta, RuntimeCommand, RuntimeNode } from '#index.ts';

export type Ctx = {
  options: Record<string, unknown>;
  params: Record<string, unknown>;
  parents: Record<string, { options: Record<string, unknown>; params: Record<string, unknown> }>;
  rootOptions: Record<string, unknown>;
};

export type Called = { path: string; ctx: Ctx };

export function lazyCommand({
  path,
  optionNames = [],
  paramNames = [],
  description,
  loaded,
}: {
  path: string;
  optionNames?: ReadonlyArray<OptionMeta>;
  paramNames?: ReadonlyArray<string>;
  description?: string;
  loaded: LoadedCommand;
}): RuntimeCommand {
  return {
    path,
    optionNames,
    paramNames,
    ...(description === undefined ? {} : { description }),
    load: async () => loaded,
  };
}

export function record({ calls, path }: { calls: Called[]; path: string }) {
  return (ctx: Ctx) => {
    calls.push({ path, ctx });
  };
}

type Children = Record<string, RuntimeNode>;

export function root({
  command,
  children,
  paramChild,
}: {
  command: RuntimeCommand | null;
  children?: Children;
  paramChild?: RuntimeNode | null;
}): RuntimeNode {
  return {
    segment: null,
    command,
    paramChild: paramChild ?? null,
    literalChildren: children ?? {},
  };
}

export function literal({
  value,
  command,
  children,
  paramChild,
}: {
  value: string;
  command: RuntimeCommand | null;
  children?: Children;
  paramChild?: RuntimeNode | null;
}): RuntimeNode {
  return {
    segment: { kind: 'literal', value },
    command,
    paramChild: paramChild ?? null,
    literalChildren: children ?? {},
  };
}

export function param({
  name,
  command,
  children,
  paramChild,
}: {
  name: string;
  command: RuntimeCommand | null;
  children?: Children;
  paramChild?: RuntimeNode | null;
}): RuntimeNode {
  return {
    segment: { kind: 'param', name },
    command,
    paramChild: paramChild ?? null,
    literalChildren: children ?? {},
  };
}
