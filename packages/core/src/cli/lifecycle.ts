type LifecycleResult = { ok: true } | { ok: false; error: unknown };

// biome-ignore lint/suspicious/noExplicitAny: ctx shape is enforced at the defineCommand call site (see LoadedCommand)
type Hook = (ctx: any) => void | Promise<void>;

export async function runHandlerLifecycle({
  beforeHandler,
  handler,
  afterHandler,
  ctx,
}: {
  beforeHandler: Hook | undefined;
  handler: Hook;
  afterHandler: Hook | undefined;
  ctx: unknown;
}): Promise<LifecycleResult> {
  const steps: ReadonlyArray<Hook | undefined> = [beforeHandler, handler, afterHandler];
  for (const fn of steps) {
    if (!fn) {
      continue;
    }
    try {
      await fn(ctx);
    } catch (error) {
      return { ok: false, error };
    }
  }
  return { ok: true };
}
