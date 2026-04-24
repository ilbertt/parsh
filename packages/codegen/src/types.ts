export type SourceSegment =
  | { readonly kind: 'literal'; readonly value: string }
  | { readonly kind: 'param'; readonly name: string };

export interface ExtractedCommand {
  filePath: string;
  pathString: string;
  segments: SourceSegment[];
  optionNames: string[];
  paramNames: string[];
  importName: string;
  importSpecifier: string;
}

export interface CommandNode {
  segment: SourceSegment | null;
  command: ExtractedCommand | null;
  literalChildren: Map<string, CommandNode>;
  paramChild: CommandNode | null;
  path: string[];
}
