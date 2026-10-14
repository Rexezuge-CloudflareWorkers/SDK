/**
 * The scheduled-task Template Method, and the run-record port it records through.
 *
 * Converged from `apps/background/src/scheduled/{IScheduledTask,TaskRegistry}.ts`
 * in seven repos, where the copies range from 13 lines (CalDAV-Bridge) to 103
 * (Mail-Otter). Mail-Otter's was the one that had solved the defects the others
 * carried, so this is that one.
 *
 * ## What the smaller copies were missing
 *
 * - **Run bookkeeping.** A task that fails silently leaves an operator with a
 *   cron that appears to run and never does. `runId` here is the record that
 *   says which.
 * - **A failure that is recorded as a failure.** The template's `catch` writes
 *   `failRun`, so the task-runs table shows the reason rather than a row that
 *   stopped at `running`.
 * - **A test seam.** `createRunRecorder` is a Factory Method so a suite
 *   substitutes a double without a D1 binding.
 *
 * ## Why the recorder is a port and not a DAO
 *
 * `runtime` is the DI and platform layer and has no `d1` dependency — that
 * would invert the package graph. The port is four methods; the consumer binds
 * its `BackgroundTaskRunDAO` at the composition root.
 */

/**
The summary a task reports when it finishes.
*/
interface TaskRunSummary {
  itemsProcessed: number;
  itemsFailed: number;
  summary?: string;
  details?: unknown;
}

/**
 * Where run records go.
 *
 * Implemented by each repo's `BackgroundTaskRunDAO`; supplied as a factory so a
 * task can be constructed before the binding is known.
 */
interface TaskRunRecorder {
  startRun(fields: { taskType: string; applicationId?: string }): Promise<string>;
  succeedRun(runId: string, result: TaskRunSummary): Promise<void>;
  failRun(runId: string, errorMessage: string, partial?: Partial<TaskRunSummary>): Promise<void>;
  skipRun(runId: string, reason?: string): Promise<void>;
}

/**
 * A handle to one run's completion.
 *
 * Every method swallows its own recording failure and logs a warning. A task
 * whose work succeeded must not be reported as failed because the bookkeeping
 * write did not land — that is the same class of defect as a status read that
 * writes.
 */
interface ApplicationRunHandle {
  succeed(result: TaskRunSummary): Promise<void>;
  fail(errorMessage: string, partial?: Partial<TaskRunSummary>): Promise<void>;
  skip(reason?: string): Promise<void>;
}

/**
The minimum a task needs from `env`: a D1 binding, when the repo has one.
*/
interface ScheduledTaskEnv {
  DB?: unknown;
}

/**
 * The cron event, structurally.
 *
 * Declared here rather than taken from `@cloudflare/workers-types`: this package
 * stays typecheckable with no platform types installed, the same trade
 * `AbstractEntrypointWorker` makes. A consumer's real `ScheduledController`
 * satisfies it.
 */
interface ScheduledControllerLike {
  cron: string;
  scheduledTime: number;
  noRetry(): void;
}

/**
The execution context, structurally. See {@link ScheduledControllerLike}.
*/
interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

type TaskLogger = (level: 'warn' | 'error', message: string) => void;

const consoleLogger: TaskLogger = (level, message) => {
  if (level === 'warn') console.warn(message);
  else console.error(message);
};

/**
 * The base every scheduled task extends.
 *
 * Subclasses implement {@link handleScheduledTask} and, when they want their
 * runs recorded, override {@link getTaskType}.
 */
abstract class AbstractScheduledTask<TEnv extends ScheduledTaskEnv = ScheduledTaskEnv> {
  /**
   * The task type recorded against each run, or `null` to opt out.
   *
   * Opting **in** rather than out is deliberate: a task that never reports is
   * invisible, and invisibility is the failure mode worth avoiding by default.
   * A per-application task should leave this `null` and use
   * {@link createApplicationRun} instead, so it does not produce a redundant
   * global record beside its per-application ones.
   */
  protected getTaskType(): string | null {
    return null;
  }

  /**
  Factory Method for the recorder. Override in tests.
  */
  protected createRunRecorder(): TaskRunRecorder | null {
    return null;
  }

  /**
  Override to route this task's failures somewhere other than the console.
  */
  protected logger(): TaskLogger {
    return consoleLogger;
  }

  /**
   * Whether `handle` swallows a failure after recording it.
   *
   * `false`, so a failed task **throws** at the platform once its run record
   * says why. The record is the durable evidence, but it is not the caller's
   * answer: a cron Durable Object that catches the rejection is the only party
   * that knows which invocation failed, and swallowing inside the task turned
   * that invocation into a *success* — an operator reading the schedule saw
   * "completed" for a task that had failed outright, with the evidence one
   * unrelated screen away.
   *
   * It exists because the opposite is a legitimate deployment choice, not
   * because it is the default: a repo whose platform retries a cron rejection
   * wants the whole batch re-run, and for that a per-task throw is the wrong
   * blast radius. Recording happens either way — the escape hatch changes who
   * learns about the failure, never whether it is remembered.
   */
  protected swallowErrors(): boolean {
    return false;
  }

  /**
   * The entry point the platform calls.
   *
   * Owns the try/catch so a task cannot forget it: a scheduled task that throws
   * uncaught is retried by the platform with no record of why. So the record is
   * written **before** the error is re-raised — that ordering is the point of
   * this method, and a subclass that overrides `handle` loses it.
   */
  public async handle(event: ScheduledControllerLike, env: TEnv, ctx: ExecutionContextLike): Promise<void> {
    const taskType = this.getTaskType();
    const recorder = taskType === null ? null : this.createRunRecorder();

    let runId: string | null = null;
    if (recorder && taskType !== null) {
      runId = await recorder.startRun({ taskType }).catch((): string | null => {
        // Losing the record must not lose the run: `null` is the absent run
        // id, which the `succeedRun` guard below already treats as "unrecorded".
        this.logger()('warn', `[${this.constructor.name}] failed to start task run record`);
        return null;
      });
    }

    try {
      const result = await this.handleScheduledTask(event, env, ctx);
      if (recorder && runId) {
        await recorder.succeedRun(runId, result ?? { itemsProcessed: 0, itemsFailed: 0 }).catch(() => {
          this.logger()('warn', `[${this.constructor.name}] failed to mark task run succeeded`);
        });
      }
    } catch (error: unknown) {
      this.logger()('error', `[${this.constructor.name}] uncaught error`);
      if (recorder && runId) {
        const message = error instanceof Error ? error.message : String(error);
        await recorder.failRun(runId, message).catch(() => {
          this.logger()('warn', `[${this.constructor.name}] failed to mark task run failed`);
        });
      }
      // After the record, never before: a rejection that escapes this method
      // must leave a `failed` row behind it, and `failRun` is what writes it.
      if (!this.swallowErrors()) throw error;
    }
  }

  /**
   * Open a per-application run record.
   *
   * Call inside a loop over applications, so the operator sees which one failed
   * rather than a single row for the whole cron.
   */
  protected async createApplicationRun(taskType: string, applicationId: string): Promise<ApplicationRunHandle | null> {
    const recorder = this.createRunRecorder();
    if (!recorder) return null;
    const runId = await recorder.startRun({ taskType, applicationId });

    const warn = (op: string) => (): void => {
      this.logger()('warn', `[${this.constructor.name}] failed to mark application run ${op}`);
    };

    return {
      succeed: (result: TaskRunSummary): Promise<void> =>
        recorder
          .succeedRun(runId, result)
          .catch(warn('succeeded'))
          .then(() => {}),
      fail: (errorMessage: string, partial?: Partial<TaskRunSummary>): Promise<void> =>
        recorder
          .failRun(runId, errorMessage, partial)
          .catch(warn('failed'))
          .then(() => {}),
      skip: (reason?: string): Promise<void> =>
        recorder
          .skipRun(runId, reason)
          .catch(warn('skipped'))
          .then(() => {}),
    };
  }

  /**
   * The task's work.
   *
   * Returns a summary to be recorded, or nothing for a task whose runs are not
   * tracked.
   */
  protected abstract handleScheduledTask(
    event: ScheduledControllerLike,
    env: TEnv,
    ctx: ExecutionContextLike,
  ): Promise<TaskRunSummary | void>;
}

/**
 * The phase registry.
 *
 * Two phases, run in order, each internally parallel. The split is what keeps
 * one slow task from delaying the pruning that has to run behind it — and it is
 * why this is a table rather than a list: adding a task at index 0 cannot
 * silently reclassify every task after it.
 */
class TaskRegistry {
  private readonly byPhase = new Map<number, AbstractScheduledTask[]>();

  public register(phase: number, task: AbstractScheduledTask): this {
    const existing = this.byPhase.get(phase) ?? [];
    existing.push(task);
    this.byPhase.set(phase, existing);
    return this;
  }

  /**
  Every task in a phase, in registration order.
  */
  public tasksForPhase(phase: number): readonly AbstractScheduledTask[] {
    return this.byPhase.get(phase) ?? [];
  }

  /**
  The phases that have at least one task, ascending.
  */
  public phases(): readonly number[] {
    return [...this.byPhase.keys()].sort((left, right) => left - right);
  }
}

export { AbstractScheduledTask, TaskRegistry };
export type { ApplicationRunHandle, ScheduledTaskEnv, TaskLogger, TaskRunRecorder, TaskRunSummary };
