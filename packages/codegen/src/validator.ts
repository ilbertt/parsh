import type { CommandNode, ExtractedCommand, SourceSegment } from '#types.ts';

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

function checkParamParamShadow(input: {
  ancestors: Ancestors;
  segment: ParamSegment;
  nodePath: string[];
}): ValidationIssue | null {
  const existing = input.ancestors.params.get(input.segment.name);
  if (!existing) {
    return null;
  }
  return {
    message: `param [${input.segment.name}] at '${formatPath(input.nodePath)}' shadows an ancestor param [${input.segment.name}] (first declared in ${existing}). Rename to avoid ambiguity.`,
  };
}

function checkParamOptionShadow(input: {
  cmd: ExtractedCommand;
  segment: ParamSegment;
  nodePath: string[];
}): ValidationIssue | null {
  if (!input.cmd.optionNames.includes(input.segment.name)) {
    return null;
  }
  return {
    message: `command '${formatPath(input.nodePath)}' (${input.cmd.filePath}) declares option '${input.segment.name}' that shadows its own param [${input.segment.name}]. Rename one.`,
  };
}

function checkOptionCollisions(input: {
  cmd: ExtractedCommand;
  ancestors: Ancestors;
}): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  for (const opt of input.cmd.optionNames) {
    const prev = input.ancestors.options.get(opt);
    if (prev) {
      out.push({
        message: `option '${opt}' in ${input.cmd.filePath} collides with ancestor option '${opt}' in ${prev}. v0.1 rejects same-name options across ancestry; rename one.`,
      });
    }
  }
  return out;
}

function checkParamSegmentAgreement(input: {
  cmd: ExtractedCommand;
  segment: SourceSegment | null;
  nodePath: string[];
}): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const cmd = input.cmd;
  if (segmentIsParam(input.segment)) {
    const segName = input.segment.name;
    if (!cmd.paramNames.includes(segName)) {
      out.push({
        message: `command '${formatPath(input.nodePath)}' (${cmd.filePath}) has path segment [${segName}] but its params object does not declare '${segName}'.`,
      });
    }
    for (const p of cmd.paramNames) {
      if (p !== segName) {
        out.push({
          message: `command '${formatPath(input.nodePath)}' (${cmd.filePath}) declares param '${p}' which is not in its path string.`,
        });
      }
    }
  } else if (cmd.paramNames.length > 0) {
    out.push({
      message: `command '${formatPath(input.nodePath)}' (${cmd.filePath}) declares params but its path has no [bracket] segment.`,
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

  function descend(input: { node: CommandNode; ancestors: Ancestors }) {
    const cmd = input.node.command;
    const segment = input.node.segment;
    const nodePath = input.node.path;

    const nextOptions = new Map(input.ancestors.options);
    const nextParams = new Map(input.ancestors.params);

    if (segmentIsParam(segment)) {
      const shadow = checkParamParamShadow({
        ancestors: input.ancestors,
        segment,
        nodePath,
      });
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
      issues.push(...checkOptionCollisions({ cmd, ancestors: input.ancestors }));
      issues.push(...checkParamSegmentAgreement({ cmd, segment, nodePath }));

      for (const opt of cmd.optionNames) {
        nextOptions.set(opt, cmd.filePath);
      }
    }

    for (const child of input.node.literalChildren.values()) {
      descend({ node: child, ancestors: { options: nextOptions, params: nextParams } });
    }
    if (input.node.paramChild) {
      descend({
        node: input.node.paramChild,
        ancestors: { options: nextOptions, params: nextParams },
      });
    }
  }

  descend({ node: root, ancestors: { options: new Map(), params: new Map() } });

  return issues;
}
