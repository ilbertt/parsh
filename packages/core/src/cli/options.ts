import type { ParseArgsConfig } from 'node:util';
import type { AnyOption, OptionsRecord } from '../schema.js';
import { inferOptionParserShape, type ParserShape, type SpecRecord } from './schema-validate.js';
import type { LoadedCommand, RuntimeCommand, RuntimeNode } from './tree.js';

export interface OptionDescriptor {
  name: string;
  shape: ParserShape;
  forwardToChildren: boolean;
  description?: string;
  aliases: ReadonlyArray<string>;
  source: string;
}

export function optionSpecsFor({
  options,
  includeSelfOnly,
}: {
  options: OptionsRecord;
  includeSelfOnly: boolean;
}): SpecRecord {
  const out: SpecRecord = {};
  for (const [name, opt] of Object.entries(options) as Array<[string, AnyOption]>) {
    if (!includeSelfOnly && opt.forwardToChildren !== true) {
      continue;
    }
    out[name] = {
      schema: opt.schema,
      ...(opt.required !== undefined && { required: opt.required }),
    };
  }
  return out;
}

export async function describeLoadedOptions({
  options,
  source,
}: {
  options: OptionsRecord;
  source: string;
}): Promise<OptionDescriptor[]> {
  const out: OptionDescriptor[] = [];
  for (const [name, opt] of Object.entries(options) as Array<[string, AnyOption]>) {
    const shape = await inferOptionParserShape(opt.schema);
    out.push({
      name,
      shape,
      forwardToChildren: opt.forwardToChildren === true,
      ...(opt.description !== undefined ? { description: opt.description } : {}),
      aliases: opt.aliases ?? [],
      source,
    });
  }
  return out;
}

export function buildParserConfigFromDescriptors(
  descriptors: ReadonlyArray<OptionDescriptor>,
): ParseArgsConfig['options'] {
  const out: NonNullable<ParseArgsConfig['options']> = {};
  for (const d of descriptors) {
    out[d.name] = d.shape.multiple ? { type: 'string', multiple: true } : { type: d.shape.type };
  }
  return out;
}

export function buildAliasMapFromDescriptors(
  descriptors: ReadonlyArray<OptionDescriptor>,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const d of descriptors) {
    for (const alias of d.aliases) {
      out.set(alias, d.name);
    }
  }
  return out;
}

export async function collectDescriptors({
  visitedCmds,
  node,
  loaded,
}: {
  visitedCmds: ReadonlyArray<RuntimeCommand>;
  node: RuntimeNode;
  loaded: Map<RuntimeCommand, LoadedCommand>;
}): Promise<OptionDescriptor[]> {
  const out: OptionDescriptor[] = [];
  for (const cmd of visitedCmds) {
    const lc = loaded.get(cmd);
    if (!lc) {
      continue;
    }
    const isTarget = cmd === node.command;
    const sliced: OptionsRecord = {};
    for (const [name, opt] of Object.entries(lc.options) as Array<[string, AnyOption]>) {
      if (isTarget || opt.forwardToChildren === true) {
        sliced[name] = opt;
      }
    }
    const ds = await describeLoadedOptions({
      options: sliced,
      source: cmd.path === '' ? '<root>' : cmd.path,
    });
    out.push(...ds);
  }
  return out;
}

export function optionLabel(d: { name: string; aliases?: ReadonlyArray<string> }): string {
  const flag = `--${d.name}`;
  const aliases = (d.aliases ?? []).map((a) => (a.length === 1 ? `-${a}` : `--${a}`));
  return [flag, ...aliases].join(', ');
}
