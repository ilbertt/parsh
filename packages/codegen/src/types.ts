/** One segment of a command path: either a literal name or a dynamic `[param]`. */
export type SourceSegment =
  | { readonly kind: 'literal'; readonly value: string }
  | { readonly kind: 'param'; readonly name: string };

/** Data extracted from a single command file's `defineCommand(...)` call. */
export interface ExtractedCommand {
  /** Absolute path to the source file. */
  filePath: string;
  /** Path string declared in the `defineCommand('…', ...)` call. */
  pathString: string;
  /** Segments parsed from the path string. */
  segments: SourceSegment[];
  /** Names of keys in the `args: { … }` object literal. */
  argNames: string[];
  /** Names of keys in the `params: { … }` object literal (empty if absent). */
  paramNames: string[];
  /** Import identifier used in the generated file (e.g., `deployCmd`). */
  importName: string;
  /** Import specifier relative to the generated output file. */
  importSpecifier: string;
}

/** In-memory intermediate tree built from filesystem walk. */
export interface CommandNode {
  segment: SourceSegment | null;
  command: ExtractedCommand | null;
  literalChildren: Map<string, CommandNode>;
  paramChild: CommandNode | null;
  /** Path from root to this node, for error messages. */
  path: string[];
}
