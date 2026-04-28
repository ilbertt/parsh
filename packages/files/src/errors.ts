/** Thrown when a file expected to exist on disk is missing. */
export class FileNotFoundError extends Error {
  readonly path: string;
  constructor({ path, message }: { path: string; message?: string }) {
    super(message ?? `file not found at ${path}`);
    this.name = 'FileNotFoundError';
    this.path = path;
  }
}

/** Thrown when JSON is malformed or fails schema validation. `issues` carries one entry per failing path. */
export class FileValidationError extends Error {
  readonly path: string;
  readonly issues: ReadonlyArray<{ message: string; path: string }>;
  constructor({
    path,
    issues,
  }: {
    path: string;
    issues: ReadonlyArray<{ message: string; path: string }>;
  }) {
    const summary = issues
      .map((i) => (i.path === '' ? i.message : `${i.path}: ${i.message}`))
      .join('; ');
    super(`invalid file at ${path}: ${summary}`);
    this.name = 'FileValidationError';
    this.path = path;
    this.issues = issues;
  }
}
