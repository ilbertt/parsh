import { stdoutBold, stdoutCyan, stdoutDim } from '../style.js';
import { describeLoadedOptions, optionLabel } from './options.js';
import {
  type LoadedCommand,
  loadDescendants,
  type RuntimeCommand,
  type RuntimeNode,
} from './tree.js';

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
  lines.push(stdoutBold('Commands:'));
  const rows: Array<{ label: string; description: string | undefined }> = [];
  function walk({ node, prefix }: { node: RuntimeNode; prefix: string[] }) {
    for (const [name, child] of Object.entries(node.literalChildren)) {
      const pieces = [...prefix, name];
      if (child.command) {
        const meta = descendantsLoaded.get(child.command);
        if (meta?.hidden !== true) {
          rows.push({ label: pieces.join(' '), description: meta?.description });
        }
      }
      walk({ node: child, prefix: pieces });
    }
    if (node.paramChild) {
      const pc = node.paramChild;
      const segName = pc.segment?.kind === 'param' ? pc.segment.name : 'param';
      const pieces = [...prefix, `<${segName}>`];
      if (pc.command) {
        const meta = descendantsLoaded.get(pc.command);
        if (meta?.hidden !== true) {
          rows.push({ label: pieces.join(' '), description: meta?.description });
        }
      }
      walk({ node: pc, prefix: pieces });
    }
  }
  walk({ node: root, prefix: [] });
  for (const line of formatTwoColumn(rows)) {
    lines.push(`  ${line}`);
  }
  return lines.join('\n');
}

export async function renderCommandUsage({
  programName,
  node,
  visited,
  loaded,
}: {
  programName: string;
  node: RuntimeNode;
  visited: ReadonlyArray<RuntimeCommand>;
  loaded: Map<RuntimeCommand, LoadedCommand>;
}): Promise<string> {
  const cmd = node.command!;
  const targetLoaded = loaded.get(cmd);
  const segments = cmd.path.split(' ').map((s) => (s.startsWith('[') ? `<${s.slice(1, -1)}>` : s));
  const lines: string[] = [];
  if (targetLoaded?.description) {
    lines.push(targetLoaded.description, '');
  }
  lines.push(`${stdoutBold('Usage:')} ${programName} ${segments.join(' ')} [options]`, '');

  const ownDescriptors = targetLoaded
    ? await describeLoadedOptions({
        options: targetLoaded.options,
        source: cmd.path === '' ? '<root>' : cmd.path,
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
    if (v.path === cmd.path) {
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

  const childrenLoaded = await loadDescendants(node);
  function isVisible(child: RuntimeNode): boolean {
    if (!child.command) {
      return false;
    }
    return childrenLoaded.get(child.command)?.hidden !== true;
  }
  const visibleSubs = Object.keys(node.literalChildren)
    .sort()
    .filter((name) => isVisible(node.literalChildren[name]!));
  const paramChildVisible =
    node.paramChild?.segment?.kind === 'param' && isVisible(node.paramChild);
  if (visibleSubs.length > 0 || paramChildVisible) {
    lines.push(stdoutBold('Subcommands:'));
    const rows: Array<{ label: string; description: string | undefined }> = [];
    for (const name of visibleSubs) {
      const child = node.literalChildren[name]!;
      const meta = child.command ? childrenLoaded.get(child.command) : undefined;
      rows.push({ label: name, description: meta?.description });
    }
    if (paramChildVisible && node.paramChild?.segment?.kind === 'param') {
      const pcCmd = node.paramChild.command;
      const meta = pcCmd ? childrenLoaded.get(pcCmd) : undefined;
      rows.push({
        label: `<${node.paramChild.segment.name}>`,
        description: meta?.description,
      });
    }
    for (const line of formatTwoColumn(rows)) {
      lines.push(`  ${line}`);
    }
  }

  return lines.join('\n').trimEnd();
}
