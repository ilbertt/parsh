export enum BuiltInErrorCode {
  Parse = 'PARSE',
  Validation = 'VALIDATION',
  Load = 'LOAD',
  Unknown = 'UNKNOWN',
}

/** Conventional Unix exit code for command-line usage errors (parseArgs, schema validation). */
export const EXIT_USAGE = 2;

/** Conventional Unix exit code for runtime failures (load error, handler exception). */
export const EXIT_FAILURE = 1;
