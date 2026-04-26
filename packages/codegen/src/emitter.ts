import type { CommandNode, ExtractedCommand, ExtractedOption, SourceSegment } from '#types.ts';

export interface EmitOptions {
  /**
   * Module specifier augmented by the generated `declare module` block and
   * imported for `InferSchemas` / `RuntimeNode`. Override for in-repo
   * dogfooding (e.g., `'@repo/core'`).
   * @default '@parsh/core'
   */
  coreModule?: string;
  /**
   * If `true`, emit static `import` statements for every command module so they
   * load at startup. The default emits dynamic `import()` thunks so handler
   * modules load only on dispatch.
   * @default false
   */
  eager?: boolean;
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
  ancestorCmds: ExtractedCommand[];
}

function flattenTree({ root }: { root: CommandNode }): FlatEntry[] {
  const out: FlatEntry[] = [];
  function walk({ node, ancestorCmds }: { node: CommandNode; ancestorCmds: ExtractedCommand[] }) {
    const cmd = node.command;
    const isTreeRoot = node === root;
    let nextAncestorCmds = ancestorCmds;
    if (cmd && !isTreeRoot) {
      out.push({
        pathString: pathStringOf(node.path.map(parseSegKey)),
        cmd,
        ancestorCmds,
      });
      nextAncestorCmds = [...ancestorCmds, cmd];
    }
    for (const name of [...node.literalChildren.keys()].sort()) {
      const child = node.literalChildren.get(name);
      if (child) {
        walk({ node: child, ancestorCmds: nextAncestorCmds });
      }
    }
    if (node.paramChild) {
      walk({ node: node.paramChild, ancestorCmds: nextAncestorCmds });
    }
  }
  walk({ node: root, ancestorCmds: [] });
  return out;
}

function parseSegKey(key: string): SourceSegment {
  if (key.startsWith('[') && key.endsWith(']')) {
    return { kind: 'param', name: key.slice(1, -1) };
  }
  return { kind: 'literal', value: key };
}

function hasForwardedOption(cmd: ExtractedCommand): boolean {
  return cmd.options.some((o) => o.forwardToChildren);
}

function ancestorOptionsType(anc: ExtractedCommand): string {
  return hasForwardedOption(anc) ? `InferForwardedOptions<typeof ${anc.importName}.options>` : '{}';
}

function ancestorParamsType(anc: ExtractedCommand): string {
  return anc.paramNames.length === 0 ? '{}' : `InferParams<typeof ${anc.importName}.params>`;
}

function emitParentsMap(entry: FlatEntry): string {
  if (entry.ancestorCmds.length === 0) {
    return '{}';
  }
  const lines = entry.ancestorCmds.map(
    (anc) =>
      `        '${pathStringOf(anc.segments)}': { options: ${ancestorOptionsType(anc)}; params: ${ancestorParamsType(anc)} };`,
  );
  return `{\n${lines.join('\n')}\n      }`;
}

function emitRootOptionsType(rootCmd: ExtractedCommand | null): string {
  return rootCmd && hasForwardedOption(rootCmd)
    ? `InferForwardedOptions<typeof ${rootCmd.importName}.options>`
    : '{}';
}

function emitRegistryEntry({
  entry,
  rootCmd,
}: {
  entry: FlatEntry;
  rootCmd: ExtractedCommand | null;
}): string {
  const p = entry.pathString;
  return `    '${p}': {
      parents: ${emitParentsMap(entry)};
      rootOptions: ${emitRootOptionsType(rootCmd)};
    };`;
}

function emitOptionMeta(opts: ReadonlyArray<ExtractedOption>): string {
  if (opts.length === 0) {
    return '[]';
  }
  return `[${opts
    .map((o) => {
      const parts = [`name: '${o.name}'`, `type: '${o.type}'`];
      if (o.forwardToChildren) {
        parts.push('forwardToChildren: true');
      }
      if (o.description !== undefined) {
        parts.push(`description: ${JSON.stringify(o.description)}`);
      }
      if (o.aliases.length > 0) {
        parts.push(`aliases: [${o.aliases.map((a) => JSON.stringify(a)).join(', ')}]`);
      }
      return `{ ${parts.join(', ')} }`;
    })
    .join(', ')}]`;
}

function emitParamNames(names: ReadonlyArray<string>): string {
  if (names.length === 0) {
    return '[]';
  }
  return `[${names.map((n) => `'${n}'`).join(', ')}]`;
}

function emitLoadFn({ cmd, eager }: { cmd: ExtractedCommand; eager: boolean }): string {
  if (eager) {
    return `() => Promise.resolve(${cmd.importName})`;
  }
  return `() => import('${cmd.importSpecifier}').then((m) => m.command)`;
}

function emitRuntimeCommand({
  cmd,
  pathString,
  eager,
}: {
  cmd: ExtractedCommand;
  pathString: string;
  eager: boolean;
}): string {
  const desc =
    cmd.description !== undefined ? `, description: ${JSON.stringify(cmd.description)}` : '';
  return `{ path: '${pathString}', optionNames: ${emitOptionMeta(cmd.options)}, paramNames: ${emitParamNames(cmd.paramNames)}${desc}, load: ${emitLoadFn({ cmd, eager })} }`;
}

function emitRuntimeNode({
  node,
  indent,
  eager,
}: {
  node: CommandNode;
  indent: string;
  eager: boolean;
}): string {
  const inner = `${indent}  `;
  const seg = node.segment;
  const segExpr =
    seg === null
      ? 'null'
      : seg.kind === 'literal'
        ? `{ kind: 'literal', value: '${seg.value}' }`
        : `{ kind: 'param', name: '${seg.name}' }`;
  const cmdExpr = node.command
    ? emitRuntimeCommand({
        cmd: node.command,
        pathString: pathStringOf(node.path.map(parseSegKey)),
        eager,
      })
    : 'null';
  const literalKeys = [...node.literalChildren.keys()].sort();
  let lcExpr: string;
  if (literalKeys.length === 0) {
    lcExpr = '{}';
  } else {
    const parts = literalKeys.map((name) => {
      const child = node.literalChildren.get(name)!;
      return `${inner}  '${name}': ${emitRuntimeNode({ node: child, indent: `${inner}  `, eager })}`;
    });
    lcExpr = `{\n${parts.join(',\n')},\n${inner}}`;
  }
  const pcExpr = node.paramChild
    ? emitRuntimeNode({ node: node.paramChild, indent: inner, eager })
    : 'null';
  return `{
${inner}segment: ${segExpr},
${inner}command: ${cmdExpr},
${inner}literalChildren: ${lcExpr},
${inner}paramChild: ${pcExpr},
${indent}}`;
}

export function emitGeneratedFile({
  root,
  emitOptions,
}: {
  root: CommandNode;
  emitOptions: EmitOptions;
}): string {
  const rootCmd = root.command;
  const entries = flattenTree({ root });
  const allCmds: ExtractedCommand[] = [...entries.map((e) => e.cmd)];
  if (rootCmd) {
    allCmds.push(rootCmd);
  }
  const sortedCmds = [...allCmds].sort(
    // biome-ignore lint/complexity/useMaxParams: Array.sort comparator is inherently (a, b)
    (a, b) => a.importName.localeCompare(b.importName),
  );

  const coreModule = emitOptions.coreModule ?? '@parsh/core';
  const eager = emitOptions.eager === true;

  // In lazy mode, only commands referenced by `InferSchemas<typeof X.options>`
  // / `...X.params` in the registry block need to be imported. In eager mode,
  // every command is also a value reference inside its `load` thunk.
  const referencedTypeImports = new Set<string>();
  for (const e of entries) {
    for (const anc of e.ancestorCmds) {
      if (hasForwardedOption(anc) || anc.paramNames.length > 0) {
        referencedTypeImports.add(anc.importName);
      }
    }
  }
  if (rootCmd && hasForwardedOption(rootCmd)) {
    referencedTypeImports.add(rootCmd.importName);
  }

  const lines: string[] = [];
  lines.push(
    '/** biome-ignore-all lint/complexity/noBannedTypes: empty-object shapes are deliberate */',
  );
  lines.push('// AUTOGENERATED by @parsh/codegen — do not edit by hand.');
  const usesForwardedOptions =
    (rootCmd ? hasForwardedOption(rootCmd) : false) ||
    entries.some((e) => e.ancestorCmds.some(hasForwardedOption));
  const usesInferParams = entries.some((e) =>
    e.ancestorCmds.some((anc) => anc.paramNames.length > 0),
  );
  const typeImports: string[] = ['RuntimeNode'];
  if (usesForwardedOptions) {
    typeImports.push('InferForwardedOptions');
  }
  if (usesInferParams) {
    typeImports.push('InferParams');
  }
  typeImports.sort();
  lines.push(`import type { ${typeImports.join(', ')} } from '${coreModule}';`);
  // Eager mode emits value imports (modules load at startup); lazy mode emits
  // type-only imports — the runtime tree uses dynamic `import()` thunks so
  // handler modules load only on dispatch.
  const importKeyword = eager ? 'import' : 'import type';
  for (const cmd of sortedCmds) {
    if (!eager && !referencedTypeImports.has(cmd.importName)) {
      continue;
    }
    lines.push(`${importKeyword} { command as ${cmd.importName} } from '${cmd.importSpecifier}';`);
  }
  lines.push('');
  lines.push(`declare module '${coreModule}' {`);
  lines.push('  interface CommandRegistry {');
  for (const e of entries) {
    lines.push(emitRegistryEntry({ entry: e, rootCmd }));
  }
  lines.push('  }');
  lines.push('}');
  lines.push('');
  lines.push(
    `export const commandTree: RuntimeNode = ${emitRuntimeNode({ node: root, indent: '', eager })};`,
  );
  lines.push('');

  return lines.join('\n');
}
