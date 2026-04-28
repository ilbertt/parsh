import { stderrDim } from '../style.js';
import { parsePathSegments } from './tree.js';

/**
 * Greedy scan to recover candidate positionals before the target chain is
 * loaded. parseArgs needs option types up-front to disambiguate `--foo bar`,
 * but we don't know option types until the chain is loaded, and we need
 * positionals to find the chain. The greedy assumption — every `--flag` /
 * `-x` token consumes the next token as its value — is right for value-taking
 * flags and wrong for booleans. After loading and running `parseArgs` with
 * real types, the resulting positionals are authoritative and we re-walk if
 * they differ.
 *
 * Tokens of shape `--name=value` consume nothing extra. Single `--` ends the
 * scan; everything after is positional. Combined short forms like `-abc`
 * are treated as a single flag-with-value-taking-next, which is wrong for
 * boolean clusters but harmless because `parseArgs` corrects later.
 */
export function collectCandidatePositionals(argv: readonly string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < argv.length) {
    const tok = argv[i]!;
    if (tok === '--') {
      for (let j = i + 1; j < argv.length; j++) {
        out.push(argv[j]!);
      }
      return out;
    }
    if (tok.length > 1 && tok.startsWith('-')) {
      if (tok.startsWith('--') && tok.includes('=')) {
        i += 1;
      } else {
        i += 2;
      }
      continue;
    }
    out.push(tok);
    i += 1;
  }
  return out;
}

/**
 * Rewrite alias tokens in argv to their canonical form before `parseArgs`.
 * Single-char aliases match `-x`; longer aliases match `--xxx`. `--alias=v`
 * and `--alias v` are both supported. Combined short forms (`-vfoo`) are
 * left untouched.
 */
export function rewriteArgvAliases({
  argv,
  aliasMap,
}: {
  argv: string[];
  aliasMap: Map<string, string>;
}): string[] {
  if (aliasMap.size === 0) {
    return argv;
  }
  return argv.map((tok) => {
    if (tok.startsWith('--')) {
      const eq = tok.indexOf('=');
      const name = eq === -1 ? tok.slice(2) : tok.slice(2, eq);
      const canonical = aliasMap.get(name);
      if (!canonical) {
        return tok;
      }
      return eq === -1 ? `--${canonical}` : `--${canonical}${tok.slice(eq)}`;
    }
    if (tok.length === 2 && tok.startsWith('-') && tok !== '--') {
      const canonical = aliasMap.get(tok.slice(1));
      if (canonical) {
        return `--${canonical}`;
      }
    }
    return tok;
  });
}

export function helpRequested(argv: string[]): boolean {
  return argv.includes('--help') || argv.includes('-h');
}

export function versionRequested(argv: string[]): boolean {
  return argv.includes('--version') || argv.includes('-V');
}

export function helpHint(enabled: boolean): string {
  return enabled ? stderrDim(' — use --help or -h to see usage') : '';
}

export function positionalsEqual({
  a,
  b,
}: {
  a: ReadonlyArray<string>;
  b: ReadonlyArray<string>;
}): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Translate the original argv into the equivalent argv for an alias's target.
 * The alias and target must declare the same params in the same order (so a
 * captured param value lines up with the target's param slot). Literals can
 * be substituted freely. The first N non-flag positionals in argv (where N
 * is the alias's segment count) are replaced with the target's literals
 * interleaved with the captured param values; flags and any extra positional
 * arguments are passed through.
 */
export function resolveAliasArgv({
  aliasPath,
  targetPath,
  argv,
}: {
  aliasPath: string;
  targetPath: string;
  argv: ReadonlyArray<string>;
}): { ok: true; argv: string[] } | { ok: false; error: string } {
  const aliasSegs = parsePathSegments(aliasPath);
  const targetSegs = parsePathSegments(targetPath);
  const aliasParams = aliasSegs.flatMap((s) => (s.kind === 'param' ? [s.name] : []));
  const targetParams = targetSegs.flatMap((s) => (s.kind === 'param' ? [s.name] : []));
  const paramsMatch =
    aliasParams.length === targetParams.length &&
    aliasParams.every(
      // biome-ignore lint/complexity/useMaxParams: Array.every callback is inherently (item, index)
      (n, i) => n === targetParams[i],
    );
  if (!paramsMatch) {
    return {
      ok: false,
      error: `alias '${aliasPath || '<root>'}' → '${targetPath}': param shapes do not match (alias has [${aliasParams.join(', ')}], target has [${targetParams.join(', ')}])`,
    };
  }

  // Walk argv with the same greedy rule as collectCandidatePositionals, but
  // record which argv indices are positionals so we can replace just the
  // alias's slice without disturbing flags / flag-values.
  const positionalIndices: number[] = [];
  let i = 0;
  while (i < argv.length) {
    const tok = argv[i]!;
    if (tok === '--') {
      for (let j = i + 1; j < argv.length; j++) {
        positionalIndices.push(j);
      }
      break;
    }
    if (tok.length > 1 && tok.startsWith('-')) {
      i += tok.startsWith('--') && tok.includes('=') ? 1 : 2;
      continue;
    }
    positionalIndices.push(i);
    i++;
  }

  if (positionalIndices.length < aliasSegs.length) {
    return {
      ok: false,
      error: `alias '${aliasPath || '<root>'}' → '${targetPath}': not enough positional arguments to match the alias`,
    };
  }

  const aliasIndices = positionalIndices.slice(0, aliasSegs.length);
  const paramValues: string[] = [];
  for (let k = 0; k < aliasSegs.length; k++) {
    if (aliasSegs[k]!.kind === 'param') {
      paramValues.push(argv[aliasIndices[k]!]!);
    }
  }

  const synthesizedTargetPositionals: string[] = [];
  let paramIndex = 0;
  for (const seg of targetSegs) {
    if (seg.kind === 'literal') {
      synthesizedTargetPositionals.push(seg.value);
    } else {
      synthesizedTargetPositionals.push(paramValues[paramIndex++] ?? '');
    }
  }

  const out: string[] = [];
  const aliasIndexSet = new Set(aliasIndices);
  const insertAt = aliasIndices[0] ?? argv.length;
  let inserted = false;
  for (let j = 0; j < argv.length; j++) {
    if (!inserted && j === insertAt) {
      out.push(...synthesizedTargetPositionals);
      inserted = true;
    }
    if (!aliasIndexSet.has(j)) {
      out.push(argv[j]!);
    }
  }
  if (!inserted) {
    out.push(...synthesizedTargetPositionals);
  }
  return { ok: true, argv: out };
}
