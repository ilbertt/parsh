export type SourceSegment =
  | { readonly kind: 'literal'; readonly value: string }
  | { readonly kind: 'param'; readonly name: string };

export interface ExtractedOption {
  name: string;
  /**
   * Statically inferred from the option's schema source text. `'boolean'` if
   * the value contains `boolean(` (e.g. `z.boolean()`, `z.coerce.boolean()`),
   * else `'string'`. Drives `node:util.parseArgs`'s type config — needed
   * because we can't probe schemas at startup in lazy mode.
   */
  type: 'boolean' | 'string';
  forwardToChildren: boolean;
  description?: string;
  aliases: string[];
}

export interface ExtractedCommand {
  filePath: string;
  pathString: string;
  segments: SourceSegment[];
  options: ExtractedOption[];
  paramNames: string[];
  importName: string;
  importSpecifier: string;
  description?: string;
  hidden?: boolean;
}

export interface CommandNode {
  segment: SourceSegment | null;
  command: ExtractedCommand | null;
  literalChildren: Map<string, CommandNode>;
  paramChild: CommandNode | null;
  path: string[];
}
