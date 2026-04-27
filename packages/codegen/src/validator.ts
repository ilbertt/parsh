import type { CommandNode, ExtractedCommand, SourceSegment } from './types.js';

export interface ValidationIssue {
  message: string;
}

interface Ancestors {
  options: Map<string, string>;
  params: Map<string, string>;
}

type ParamSegment = { kind: 'param'; name: string };

function segmentIsParam(seg: SourceSegment | null): seg is ParamSegment {
  return seg !== null && seg.kind === 'param';
}

function formatPath(path: string[]): string {
  return path.join(' ') || '<root>';
}

function checkParamParamShadow({
  ancestors,
  segment,
  nodePath,
}: {
  ancestors: Ancestors;
  segment: ParamSegment;
  nodePath: string[];
}): ValidationIssue | null {
  const existing = ancestors.params.get(segment.name);
  if (!existing) {
    return null;
  }
  return {
    message: `param [${segment.name}] at '${formatPath(nodePath)}' shadows an ancestor param [${segment.name}] (first declared in ${existing}). Rename to avoid ambiguity.`,
  };
}

function checkParamOptionShadow({
  cmd,
  segment,
  nodePath,
}: {
  cmd: ExtractedCommand;
  segment: ParamSegment;
  nodePath: string[];
}): ValidationIssue | null {
  if (!cmd.options.some((o) => o.name === segment.name)) {
    return null;
  }
  return {
    message: `command '${formatPath(nodePath)}' (${cmd.filePath}) declares option '${segment.name}' that shadows its own param [${segment.name}]. Rename one.`,
  };
}

function checkOptionCollisions({
  cmd,
  ancestors,
}: {
  cmd: ExtractedCommand;
  ancestors: Ancestors;
}): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  for (const opt of cmd.options) {
    const prev = ancestors.options.get(opt.name);
    if (prev) {
      out.push({
        message: `option '${opt.name}' in ${cmd.filePath} collides with ancestor option '${opt.name}' in ${prev}. v0.1 rejects same-name options across ancestry; rename one.`,
      });
    }
  }
  return out;
}

function checkParamSegmentAgreement({
  cmd,
  segment,
  nodePath,
}: {
  cmd: ExtractedCommand;
  segment: SourceSegment | null;
  nodePath: string[];
}): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  if (segmentIsParam(segment)) {
    const segName = segment.name;
    if (!cmd.paramNames.includes(segName)) {
      out.push({
        message: `command '${formatPath(nodePath)}' (${cmd.filePath}) has path segment [${segName}] but its params object does not declare '${segName}'.`,
      });
    }
    for (const p of cmd.paramNames) {
      if (p !== segName) {
        out.push({
          message: `command '${formatPath(nodePath)}' (${cmd.filePath}) declares param '${p}' which is not in its path string.`,
        });
      }
    }
  } else if (cmd.paramNames.length > 0) {
    out.push({
      message: `command '${formatPath(nodePath)}' (${cmd.filePath}) declares params but its path has no [bracket] segment.`,
    });
  }
  return out;
}

/**
 * v0.1 validation rules:
 *
 * 1. **Same-name option collision across ancestry.** Conservative stance —
 *    reject any same-name option declared in both an ancestor and a
 *    descendant. The brief permits same-name-same-type, but type-equality
 *    checking is out of scope for v0.1.
 * 2. **Param/option name shadowing on the same command.** `[name]` +
 *    `options.name` is ambiguous at runtime.
 * 3. **Param-param shadowing across ancestry.** An ancestor `[name]` and a
 *    descendant `[name]` collide when both are passed into ctx.params.
 * 4. **Path/params agreement.** The command's `params` keys must match the
 *    bracket segment of its own path (missing, extra, or unrelated keys all
 *    reject).
 */
export function validateTree(root: CommandNode): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  function descend({ node, ancestors }: { node: CommandNode; ancestors: Ancestors }) {
    const cmd = node.command;
    const segment = node.segment;
    const nodePath = node.path;

    const nextOptions = new Map(ancestors.options);
    const nextParams = new Map(ancestors.params);

    if (segmentIsParam(segment)) {
      const shadow = checkParamParamShadow({ ancestors, segment, nodePath });
      if (shadow) {
        issues.push(shadow);
      }
      nextParams.set(segment.name, cmd?.filePath ?? formatPath(nodePath));
    }

    if (cmd) {
      if (segmentIsParam(segment)) {
        const shadow = checkParamOptionShadow({ cmd, segment, nodePath });
        if (shadow) {
          issues.push(shadow);
        }
      }
      issues.push(...checkOptionCollisions({ cmd, ancestors }));
      issues.push(...checkParamSegmentAgreement({ cmd, segment, nodePath }));

      for (const opt of cmd.options) {
        if (opt.forwardToChildren) {
          nextOptions.set(opt.name, cmd.filePath);
        }
      }
    }

    for (const child of node.literalChildren.values()) {
      descend({ node: child, ancestors: { options: nextOptions, params: nextParams } });
    }
    if (node.paramChild) {
      descend({
        node: node.paramChild,
        ancestors: { options: nextOptions, params: nextParams },
      });
    }
  }

  descend({ node: root, ancestors: { options: new Map(), params: new Map() } });

  return issues;
}
