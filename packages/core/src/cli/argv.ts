import { stderrDim } from '../style.js';

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
