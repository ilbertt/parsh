import { stdoutBold, stdoutCyan, stdoutDim } from '../style.js';
import { describeLoadedOptions, optionLabel } from './options.js';
import {
  type LoadedCommand,
  loadDescendants,
  type RuntimeCommand,
  type RuntimeNode,
} from './tree.js';

function buildAliasIndex(loaded: Map<RuntimeCommand, LoadedCommand>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [cmd, lc] of loaded) {
    if (lc.aliasOf !== undefined) {
      const list = out.get(lc.aliasOf) ?? [];
      list.push(cmd.path);
      out.set(lc.aliasOf, list);
    }
  }
  return out;
}

function prettifyPath(path: string): string {
  return path
    .split(/\s+/)
    .map((s) => (s.startsWith('[') && s.endsWith(']') ? `<${s.slice(1, -1)}>` : s))
    .join(' ');
}

function describeForListing({
  meta,
  pathString,
  aliasIndex,
}: {
  meta: LoadedCommand | undefined;
  pathString: string;
  aliasIndex: Map<string, string[]>;
}): string | undefined {
  if (!meta) {
    return undefined;
  }
  const aliases = aliasIndex.get(pathString) ?? [];
  const aliasNote =
    aliases.length > 0
      ? `(alias${aliases.length > 1 ? 'es' : ''}: ${aliases.map(prettifyPath).join(', ')})`
      : null;
  if (meta.description && aliasNote) {
    return `${meta.description} ${aliasNote}`;
  }
  return meta.description ?? aliasNote ?? undefined;
}

interface ListingRow {
  label: string;
  description: string | undefined;
}

function collectListing({
  root,
  loaded,
  prefix,
  aliasIndex,
}: {
  root: RuntimeNode;
  loaded: Map<RuntimeCommand, LoadedCommand>;
  prefix: string[];
  aliasIndex: Map<string, string[]>;
}): ListingRow[] {
  // Pre-walk to find which command paths are reachable from this root, so we
  // can decide whether each alias should be hidden (target is in this view) or
  // shown with an "(alias of X)" annotation (target lives elsewhere).
  const reachable = new Set<string>();
  (function discover(node: RuntimeNode) {
    if (node.command) {
      reachable.add(node.command.path);
    }
    for (const child of Object.values(node.literalChildren)) {
      discover(child);
    }
    if (node.paramChild) {
      discover(node.paramChild);
    }
  })(root);

  const rows: ListingRow[] = [];
  function rowFor({ cmd, label }: { cmd: RuntimeCommand; label: string }): ListingRow | null {
    const meta = loaded.get(cmd);
    if (!meta || meta.hidden === true) {
      return null;
    }
    if (meta.aliasOf !== undefined && reachable.has(meta.aliasOf)) {
      return null;
    }
    if (meta.aliasOf !== undefined) {
      const note = `(alias of ${prettifyPath(meta.aliasOf)})`;
      const description = meta.description ? `${meta.description} ${note}` : note;
      return { label, description };
    }
    return {
      label,
      description: describeForListing({
        meta,
        pathString: cmd.path,
        aliasIndex,
      }),
    };
  }
  function walk({ node, pieces }: { node: RuntimeNode; pieces: string[] }) {
    for (const [name, child] of Object.entries(node.literalChildren)) {
      const next = [...pieces, name];
      if (child.command) {
        const row = rowFor({ cmd: child.command, label: next.join(' ') });
        if (row) {
          rows.push(row);
        }
      }
      walk({ node: child, pieces: next });
    }
    if (node.paramChild) {
      const seg = node.paramChild.segment;
      const segName = seg?.kind === 'param' ? seg.name : 'param';
      const next = [...pieces, `<${segName}>`];
      const child = node.paramChild;
      if (child.command) {
        const row = rowFor({ cmd: child.command, label: next.join(' ') });
        if (row) {
          rows.push(row);
        }
      }
      walk({ node: child, pieces: next });
    }
  }
  walk({ node: root, pieces: prefix });
  return rows;
}

function formatTwoColumn(
  rows: ReadonlyArray<{ label: string; description: string | undefined }>,
): string[] {
  const width = rows.reduce(
    // biome-ignore lint/complexity/useMaxParams: Array.reduce callback is inherently (acc, item)
    (w, r) => Math.max(w, r.label.length),
    0,
  );
  return rows.map((r) => {
    const padded = r.label.padEnd(width);
    const styled = stdoutCyan(padded);
    return r.description ? `${styled}  ${stdoutDim(r.description)}` : stdoutCyan(r.label);
  });
}

export async function renderRootUsage({
  root,
  programName,
  programDescription,
  hasVersion,
  loadedRoot,
}: {
  root: RuntimeNode;
  programName: string;
  programDescription: string | undefined;
  hasVersion: boolean;
  loadedRoot: LoadedCommand | null;
}): Promise<string> {
  const lines: string[] = [];
  if (programDescription) {
    lines.push(programDescription, '');
  }
  lines.push(`${stdoutBold('Usage:')} ${programName} <command> [options]`, '');

  const rootDescriptors = loadedRoot
    ? await describeLoadedOptions({ options: loadedRoot.options, source: '<root>' })
    : [];
  const optionRows = rootDescriptors.map((d) => ({
    label: optionLabel(d),
    description: d.description,
  }));
  optionRows.push({ label: '--help, -h', description: 'Show this help message.' });
  if (hasVersion) {
    optionRows.push({ label: '--version, -V', description: 'Print the version and exit.' });
  }
  lines.push(stdoutBold('Options:'));
  for (const line of formatTwoColumn(optionRows)) {
    lines.push(`  ${line}`);
  }
  lines.push('');

  const descendantsLoaded = await loadDescendants(root);
  const aliasIndex = buildAliasIndex(descendantsLoaded);
  const rows = collectListing({
    root,
    loaded: descendantsLoaded,
    prefix: [],
    aliasIndex,
  });
  if (rows.length > 0) {
    lines.push(stdoutBold('Commands:'));
    for (const line of formatTwoColumn(rows)) {
      lines.push(`  ${line}`);
    }
  }
  return lines.join('\n');
}

export async function renderCommandUsage({
  programName,
  node,
  nodePath,
  visited,
  loaded,
}: {
  programName: string;
  node: RuntimeNode;
  nodePath: ReadonlyArray<string>;
  visited: ReadonlyArray<RuntimeCommand>;
  loaded: Map<RuntimeCommand, LoadedCommand>;
}): Promise<string> {
  const cmd = node.command;
  const targetLoaded = cmd ? loaded.get(cmd) : undefined;
  const lines: string[] = [];
  if (targetLoaded?.description) {
    lines.push(targetLoaded.description, '');
  }
  const usageTail = cmd ? '[options]' : '<subcommand>';
  lines.push(`${stdoutBold('Usage:')} ${[programName, ...nodePath, usageTail].join(' ')}`, '');

  const ownDescriptors = targetLoaded
    ? await describeLoadedOptions({
        options: targetLoaded.options,
        source: cmd && cmd.path !== '' ? cmd.path : '<root>',
      })
    : [];
  if (ownDescriptors.length > 0) {
    lines.push(stdoutBold('Options:'));
    for (const line of formatTwoColumn(
      ownDescriptors.map((d) => ({ label: optionLabel(d), description: d.description })),
    )) {
      lines.push(`  ${line}`);
    }
    lines.push('');
  }

  const inheritedRows: Array<{ label: string; description: string | undefined }> = [];
  for (const v of visited) {
    if (cmd && v.path === cmd.path) {
      continue;
    }
    const ancLoaded = loaded.get(v);
    if (!ancLoaded) {
      continue;
    }
    const from = v.path === '' ? '<root>' : v.path;
    const ancDescriptors = await describeLoadedOptions({
      options: ancLoaded.options,
      source: from,
    });
    for (const d of ancDescriptors) {
      if (!d.forwardToChildren) {
        continue;
      }
      const descParts = [d.description, `(inherited from ${from})`].filter(Boolean);
      inheritedRows.push({ label: optionLabel(d), description: descParts.join(' ') });
    }
  }
  if (inheritedRows.length > 0) {
    lines.push(stdoutBold('Inherited options:'));
    for (const line of formatTwoColumn(inheritedRows)) {
      lines.push(`  ${line}`);
    }
    lines.push('');
  }

  const descendantsLoaded = await loadDescendants(node);
  const aliasIndex = buildAliasIndex(descendantsLoaded);
  const subcommandRows = collectListing({
    root: node,
    loaded: descendantsLoaded,
    prefix: [],
    aliasIndex,
  });
  if (subcommandRows.length > 0) {
    lines.push(stdoutBold('Subcommands:'));
    for (const line of formatTwoColumn(subcommandRows)) {
      lines.push(`  ${line}`);
    }
  }

  return lines.join('\n').trimEnd();
}
