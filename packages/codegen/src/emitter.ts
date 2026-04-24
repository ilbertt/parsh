import type { CommandNode, ExtractedCommand, SourceSegment } from '#types.ts';

export interface EmitOptions {
  /**
   * TS expression for inferring root args, e.g. `"typeof import('../root.ts').rootArgs"`.
   * If omitted, root args contribute `{}` to `inherited`.
   */
  rootArgsTypeExpr?: string;
  /** TS expression for the per-command ctx type (reserved). Defaults to `{}`. */
  rootCtxTypeExpr?: string;
  /**
   * Module specifier augmented by the generated `declare module` block and imported
   * for `InferArgs` / `RuntimeNode`. Defaults to `'@parsh/core'`.
   * Override for in-repo dogfooding (e.g., `'@repo/core'`).
   */
  coreModule?: string;
}

function segmentKey(seg: SourceSegment): string {
  return seg.kind === 'literal' ? seg.value : `[${seg.name}]`;
}

function pathStringOf(segments: SourceSegment[]): string {
  return segments.map(segmentKey).join(' ');
}

interface FlatEntry {
  pathString: string;
  cmd: ExtractedCommand;
  segments: SourceSegment[];
  /** All ancestor commands (closest-last). */
  ancestorCmds: ExtractedCommand[];
  /** Params introduced by ancestors, in order. */
  ancestorParams: Array<{ name: string; owner: ExtractedCommand }>;
}

function flattenTree(root: CommandNode): FlatEntry[] {
  const out: FlatEntry[] = [];
  function walk(input: {
    node: CommandNode;
    ancestorCmds: ExtractedCommand[];
    ancestorParams: Array<{ name: string; owner: ExtractedCommand }>;
  }) {
    const cmd = input.node.command;
    let nextAncestorCmds = input.ancestorCmds;
    let nextAncestorParams = input.ancestorParams;
    if (cmd) {
      out.push({
        pathString: pathStringOf(input.node.path.map(parseSegKey)),
        cmd,
        segments: input.node.path.map(parseSegKey),
        ancestorCmds: input.ancestorCmds,
        ancestorParams: input.ancestorParams,
      });
      nextAncestorCmds = [...input.ancestorCmds, cmd];
      // Params contributed by THIS cmd (only the one matching this segment) flow to children.
      const seg = input.node.segment;
      if (seg?.kind === 'param') {
        nextAncestorParams = [...input.ancestorParams, { name: seg.name, owner: cmd }];
      }
    } else if (input.node.segment?.kind === 'param') {
      // Pure param namespace with no sibling file — still passes the param name through,
      // but without a schema we cannot type it. Emit as `string`.
      nextAncestorParams = [
        ...input.ancestorParams,
        {
          name: input.node.segment.name,
          owner: {
            filePath: '<pure-param-namespace>',
            pathString: '',
            segments: [],
            argNames: [],
            paramNames: [],
            importName: '__pureString',
            importSpecifier: '',
          },
        },
      ];
    }
    const literalNames = [...input.node.literalChildren.keys()].sort();
    for (const name of literalNames) {
      const child = input.node.literalChildren.get(name);
      if (child) {
        walk({
          node: child,
          ancestorCmds: nextAncestorCmds,
          ancestorParams: nextAncestorParams,
        });
      }
    }
    if (input.node.paramChild) {
      walk({
        node: input.node.paramChild,
        ancestorCmds: nextAncestorCmds,
        ancestorParams: nextAncestorParams,
      });
    }
  }
  walk({ node: root, ancestorCmds: [], ancestorParams: [] });
  return out;
}

function parseSegKey(key: string): SourceSegment {
  if (key.startsWith('[') && key.endsWith(']')) {
    return { kind: 'param', name: key.slice(1, -1) };
  }
  return { kind: 'literal', value: key };
}

function intersectOrEmpty(parts: string[]): string {
  if (parts.length === 0) {
    return '{}';
  }
  return parts.join(' & ');
}

function argsTypeName(cmd: ExtractedCommand): string {
  return `${cmd.importName}Args`;
}

function paramsTypeName(cmd: ExtractedCommand): string {
  return `${cmd.importName}Params`;
}

function emitInheritedArgs(opts: {
  entry: FlatEntry;
  rootArgsTypeExpr: string | undefined;
}): string {
  const parts: string[] = [];
  if (opts.rootArgsTypeExpr) {
    parts.push(`InferArgs<${opts.rootArgsTypeExpr}>`);
  }
  for (const anc of opts.entry.ancestorCmds) {
    if (anc.argNames.length > 0) {
      parts.push(`InferArgs<typeof ${argsTypeName(anc)}>`);
    }
  }
  return intersectOrEmpty(parts);
}

function emitOwnArgs(cmd: ExtractedCommand): string {
  if (cmd.argNames.length === 0) {
    return '{}';
  }
  return `InferArgs<typeof ${argsTypeName(cmd)}>`;
}

function emitOwnParams(cmd: ExtractedCommand): string {
  if (cmd.paramNames.length === 0) {
    return '{}';
  }
  return `InferArgs<typeof ${paramsTypeName(cmd)}>`;
}

function emitInheritedParams(entry: FlatEntry): string {
  const parts: string[] = [];
  for (const p of entry.ancestorParams) {
    if (p.owner.importName === '__pureString') {
      parts.push(`{ ${p.name}: string }`);
      continue;
    }
    parts.push(`Pick<InferArgs<typeof ${paramsTypeName(p.owner)}>, '${p.name}'>`);
  }
  return intersectOrEmpty(parts);
}

function emitRegistryEntry(opts: {
  entry: FlatEntry;
  rootArgsTypeExpr: string | undefined;
  rootCtxTypeExpr: string;
}): string {
  const p = opts.entry.pathString;
  return `    '${p}': {
      own: ${emitOwnArgs(opts.entry.cmd)};
      inherited: ${emitInheritedArgs({ entry: opts.entry, rootArgsTypeExpr: opts.rootArgsTypeExpr })};
      ctx: ${opts.rootCtxTypeExpr};
      params: ${emitOwnParams(opts.entry.cmd)};
      inheritedParams: ${emitInheritedParams(opts.entry)};
    };`;
}

function emitRuntimeNode(opts: { node: CommandNode; indent: string }): string {
  const ind = opts.indent;
  const inner = `${ind}  `;
  const seg = opts.node.segment;
  const segExpr =
    seg === null
      ? 'null'
      : seg.kind === 'literal'
        ? `{ kind: 'literal', value: '${seg.value}' }`
        : `{ kind: 'param', name: '${seg.name}' }`;
  const cmdExpr = opts.node.command ? opts.node.command.importName : 'null';
  const literalKeys = [...opts.node.literalChildren.keys()].sort();
  let lcExpr: string;
  if (literalKeys.length === 0) {
    lcExpr = '{}';
  } else {
    const parts = literalKeys.map((name) => {
      const child = opts.node.literalChildren.get(name)!;
      return `${inner}  '${name}': ${emitRuntimeNode({ node: child, indent: `${inner}  ` })}`;
    });
    lcExpr = `{\n${parts.join(',\n')},\n${inner}}`;
  }
  const pcExpr = opts.node.paramChild
    ? emitRuntimeNode({ node: opts.node.paramChild, indent: inner })
    : 'null';
  return `{
${inner}segment: ${segExpr},
${inner}command: ${cmdExpr},
${inner}literalChildren: ${lcExpr},
${inner}paramChild: ${pcExpr},
${ind}}`;
}

export function emitGeneratedFile(opts: { root: CommandNode; emitOptions: EmitOptions }): string {
  const entries = flattenTree(opts.root);
  const imports = entries
    .map((e) => e.cmd)
    // biome-ignore lint/complexity/useMaxParams: Array.sort comparator is inherently (a, b)
    .sort((a, b) => a.importName.localeCompare(b.importName));

  const rootCtxTypeExpr = opts.emitOptions.rootCtxTypeExpr ?? '{}';
  const coreModule = opts.emitOptions.coreModule ?? '@parsh/core';

  const lines: string[] = [];
  lines.push(
    '/** biome-ignore-all lint/complexity/noBannedTypes: empty-object shapes are deliberate */',
  );
  lines.push('// AUTOGENERATED by @parsh/codegen — do not edit by hand.');
  lines.push(`import type { InferArgs } from '${coreModule}';`);
  for (const cmd of imports) {
    const named = [`command as ${cmd.importName}`];
    if (cmd.argNames.length > 0) {
      named.push(`type args as ${argsTypeName(cmd)}`);
    }
    if (cmd.paramNames.length > 0) {
      named.push(`type params as ${paramsTypeName(cmd)}`);
    }
    lines.push(`import { ${named.join(', ')} } from '${cmd.importSpecifier}';`);
  }
  lines.push('');
  lines.push(`declare module '${coreModule}' {`);
  lines.push('  interface CommandRegistry {');
  for (const e of entries) {
    lines.push(
      emitRegistryEntry({
        entry: e,
        rootArgsTypeExpr: opts.emitOptions.rootArgsTypeExpr,
        rootCtxTypeExpr,
      }),
    );
  }
  lines.push('  }');
  lines.push('}');
  lines.push('');
  lines.push(`import type { RuntimeNode } from '${coreModule}';`);
  lines.push(
    `export const commandTree: RuntimeNode = ${emitRuntimeNode({ node: opts.root, indent: '' })};`,
  );
  lines.push('');
  return lines.join('\n');
}
