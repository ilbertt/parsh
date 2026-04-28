import type { OptionDescriptor } from './options.js';
import type { LoadedCommand, RuntimeCommand, Visited } from './tree.js';

export function detectParamOptionShadow({
  visitedCommands,
  loaded,
}: {
  visitedCommands: ReadonlyArray<Visited>;
  loaded: Map<RuntimeCommand, LoadedCommand>;
}): string | null {
  for (const v of visitedCommands) {
    if (!v.command || !v.paramName) {
      continue;
    }
    const lc = loaded.get(v.command);
    if (!lc) {
      continue;
    }
    if (Object.hasOwn(lc.options, v.paramName)) {
      const path = v.command.path === '' ? '(root)' : v.command.path;
      return `command ${path} declares option "${v.paramName}" that shadows its own param [${v.paramName}]`;
    }
  }
  return null;
}

export function detectOptionCollisions(descriptors: ReadonlyArray<OptionDescriptor>): string[] {
  const issues: string[] = [];
  const seenIds = new Map<string, OptionDescriptor>();
  const seenNames = new Map<string, OptionDescriptor>();
  for (const d of descriptors) {
    const prevName = seenNames.get(d.name);
    if (prevName && prevName.source !== d.source) {
      issues.push(
        `option '${d.name}' on ${d.source} collides with ancestor option '${d.name}' on ${prevName.source}`,
      );
      continue;
    }
    seenNames.set(d.name, d);
    const ids = [d.name, ...d.aliases];
    for (const id of ids) {
      const prev = seenIds.get(id);
      if (prev && (prev.source !== d.source || prev.name !== d.name)) {
        issues.push(
          `option identifier '${id}' on ${d.source} (option '${d.name}') collides with ${prev.source} (option '${prev.name}')`,
        );
      } else {
        seenIds.set(id, d);
      }
    }
  }
  return issues;
}
