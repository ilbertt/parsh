/**
 * Sentinel returned by the `exit(n)` factory passed to `onError`. The runtime
 * checks for it via `instanceof` so a thrown error in the user callback stays
 * distinct from a deliberate exit-code override.
 */
export class ExitSignal {
  readonly code: number;
  constructor(code: number) {
    this.code = code;
  }
}

export type ExitFn = (code: number) => ExitSignal;
