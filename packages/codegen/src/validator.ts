import type { CommandNode, SourceSegment } from './types.js';

export interface ValidationIssue {
  message: string;
}

type ParamSegment = { kind: 'param'; name: string };

function segmentIsParam(seg: SourceSegment | null): seg is ParamSegment {
  return seg !== null && seg.kind === 'param';
}

function formatPath(path: string[]): string {
  return path.join(' ') || '<root>';
}

/**
 * v0.1 validation rules that codegen can check without reading option bodies:
 *
 * 1. **Param-param shadowing across ancestry.** An ancestor `[name]` and a
 *    descendant `[name]` collide when both are passed into ctx.params.
 *
 * Other rules — same-name option collision across ancestry, param/option
 * name shadowing — depend on each command's `options` object, which codegen
 * does not read. They are detected at runtime when the command's chain is
 * loaded.
 *
 * Path/params agreement is enforced at the type level by `ParamsConstraint`
 * in `defineCommand`.
 */
export function validateTree(root: CommandNode): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  function descend({
    node,
    ancestorParams,
  }: {
    node: CommandNode;
    ancestorParams: Map<string, string>;
  }) {
    const segment = node.segment;
    const nodePath = node.path;

    const nextParams = new Map(ancestorParams);

    if (segmentIsParam(segment)) {
      const existing = ancestorParams.get(segment.name);
      if (existing) {
        issues.push({
          message: `param [${segment.name}] at '${formatPath(nodePath)}' shadows an ancestor param [${segment.name}] (first declared in ${existing}). Rename to avoid ambiguity.`,
        });
      }
      nextParams.set(segment.name, node.command?.filePath ?? formatPath(nodePath));
    }

    for (const child of node.literalChildren.values()) {
      descend({ node: child, ancestorParams: nextParams });
    }
    if (node.paramChild) {
      descend({ node: node.paramChild, ancestorParams: nextParams });
    }
  }

  descend({ node: root, ancestorParams: new Map() });

  return issues;
}
