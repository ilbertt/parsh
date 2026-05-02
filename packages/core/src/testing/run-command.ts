type Hook = (ctx: unknown) => void | Promise<void>;

type CommandWithHooks = {
  handler?: Hook;
  beforeHandler?: Hook;
  afterHandler?: Hook;
};

/**
 * Run only the cmd's `beforeHandler` against the given ctx. Throws if the cmd
 * has no `beforeHandler` — calling this on the wrong command is a test bug.
 * Errors thrown by the hook propagate as-is.
 */
export async function runCommandBeforeHandler({
  cmd,
  ctx,
}: {
  cmd: CommandWithHooks;
  ctx: unknown;
}): Promise<void> {
  if (!cmd.beforeHandler) {
    throw new Error('runCommandBeforeHandler: command has no `beforeHandler` defined');
  }
  await cmd.beforeHandler(ctx);
}

/**
 * Run only the cmd's `handler` against the given ctx. Throws if the cmd has
 * no `handler` — calling this on the wrong command is a test bug. Errors
 * thrown by the handler propagate as-is. To exercise the "no handler → show
 * usage" branch, drive the full router via `cli.run(argv)` instead.
 */
export async function runCommandHandler({
  cmd,
  ctx,
}: {
  cmd: CommandWithHooks;
  ctx: unknown;
}): Promise<void> {
  if (!cmd.handler) {
    throw new Error('runCommandHandler: command has no `handler` defined');
  }
  await cmd.handler(ctx);
}

/**
 * Run only the cmd's `afterHandler` against the given ctx. Throws if the cmd
 * has no `afterHandler` — calling this on the wrong command is a test bug.
 * Errors thrown by the hook propagate as-is.
 */
export async function runCommandAfterHandler({
  cmd,
  ctx,
}: {
  cmd: CommandWithHooks;
  ctx: unknown;
}): Promise<void> {
  if (!cmd.afterHandler) {
    throw new Error('runCommandAfterHandler: command has no `afterHandler` defined');
  }
  await cmd.afterHandler(ctx);
}

/**
 * Run `beforeHandler → handler → afterHandler` against the given ctx, with
 * the same "throw aborts the rest" semantics as the router. Throws if the cmd
 * has no `handler` — for handler-less commands the router prints usage; that
 * path is a router concern, drive it through `cli.run(argv)` instead. Errors
 * thrown by any hook propagate as-is.
 */
export async function runCommand({
  cmd,
  ctx,
}: {
  cmd: CommandWithHooks;
  ctx: unknown;
}): Promise<void> {
  if (!cmd.handler) {
    throw new Error('runCommand: command has no `handler` defined');
  }
  if (cmd.beforeHandler) {
    await cmd.beforeHandler(ctx);
  }
  await cmd.handler(ctx);
  if (cmd.afterHandler) {
    await cmd.afterHandler(ctx);
  }
}
