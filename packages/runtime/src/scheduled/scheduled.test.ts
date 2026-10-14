import { describe, expect, it, vi } from 'vitest';
import { AbstractScheduledTask, TaskRegistry } from './index.ts';
import type { ScheduledTaskEnv, TaskRunRecorder, TaskRunSummary } from './index.ts';

/**
A recorder double that records what the template asked it to write.
*/
function recorderDouble(overrides: Partial<TaskRunRecorder> = {}): TaskRunRecorder & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    startRun: async () => {
      calls.push('start');
      return 'run-1';
    },
    succeedRun: async () => {
      calls.push('succeed');
    },
    failRun: async () => {
      calls.push('fail');
    },
    skipRun: async () => {
      calls.push('skip');
    },
    ...overrides,
  };
}

const EVENT = { cron: '0 * * * *', scheduledTime: 0, noRetry: () => {} };
const CTX = { waitUntil: () => {}, passThroughOnException: () => {} };
const ENV: ScheduledTaskEnv = { DB: {} };

class RecordingTask extends AbstractScheduledTask {
  public calls: string[] = [];
  public result: TaskRunSummary = { itemsProcessed: 3, itemsFailed: 0 };

  protected override getTaskType(): string {
    return 'demo_task';
  }

  protected override createRunRecorder(): TaskRunRecorder {
    return this.recorder;
  }

  public recorder!: TaskRunRecorder;

  protected async handleScheduledTask(): Promise<TaskRunSummary> {
    this.calls.push('work');
    if (this.shouldThrow) throw new Error('origin refused the connection');
    return this.result;
  }

  public shouldThrow = false;
}

function task(rec: TaskRunRecorder): RecordingTask {
  const instance = new RecordingTask();
  instance.recorder = rec;
  return instance;
}

describe('AbstractScheduledTask', () => {
  it('runs the work and records success', async () => {
    const rec = recorderDouble();
    const instance = task(rec);

    await instance.handle(EVENT, ENV, CTX);

    expect(instance.calls).toEqual(['work']);
    expect(rec.calls).toEqual(['start', 'succeed']);
  });

  it('records the failure, then re-throws so the caller learns the task failed', async () => {
    const rec = recorderDouble();
    const instance = task(rec);
    instance.shouldThrow = true;

    // The record must be written *before* the rejection escapes: a caller that
    // caught it has to find a `failed` row behind it, not one stuck at `running`.
    await expect(instance.handle(EVENT, ENV, CTX)).rejects.toThrow('origin refused the connection');
    expect(rec.calls).toEqual(['start', 'fail']);
  });

  it('still records a failure when a task opts out of re-throwing', async () => {
    const rec = recorderDouble();
    class Swallowing extends RecordingTask {
      protected override swallowErrors(): boolean {
        return true;
      }
    }
    const instance = new Swallowing();
    instance.recorder = rec;
    instance.shouldThrow = true;

    await expect(instance.handle(EVENT, ENV, CTX)).resolves.toBeUndefined();
    expect(rec.calls).toEqual(['start', 'fail']);
  });

  it('records nothing when the task does not opt in', async () => {
    const rec = recorderDouble();
    class Untracked extends AbstractScheduledTask {
      protected async handleScheduledTask(): Promise<void> {
        return undefined;
      }
    }
    const instance = new Untracked();

    await instance.handle(EVENT, ENV, CTX);

    expect(rec.calls).toEqual([]);
  });

  it('runs the work even when the start record could not be written', async () => {
    const rec = recorderDouble({
      startRun: async () => {
        throw new Error('D1 unavailable');
      },
    });
    const instance = task(rec);

    await instance.handle(EVENT, ENV, CTX);

    // Losing the bookkeeping must not lose the cron.
    expect(instance.calls).toEqual(['work']);
  });

  it('treats an absent summary as zero processed', async () => {
    const succeedRun = vi.fn(async () => {});
    const rec = recorderDouble({ succeedRun });
    class Silent extends AbstractScheduledTask {
      protected override getTaskType(): string {
        return 'silent';
      }
      protected override createRunRecorder(): TaskRunRecorder {
        return rec;
      }
      protected async handleScheduledTask(): Promise<void> {
        return undefined;
      }
    }

    await new Silent().handle(EVENT, ENV, CTX);

    expect(succeedRun).toHaveBeenCalledWith('run-1', { itemsProcessed: 0, itemsFailed: 0 });
  });
});

describe('ApplicationRunHandle', () => {
  class PerAppTask extends AbstractScheduledTask {
    public recorder: TaskRunRecorder = recorderDouble();
    protected override createRunRecorder(): TaskRunRecorder {
      return this.recorder;
    }
    protected async handleScheduledTask(): Promise<void> {
      return undefined;
    }
    public async runOne(): Promise<void> {
      const handle = await this.createApplicationRun('sync', 'app-1');
      await handle?.succeed({ itemsProcessed: 1, itemsFailed: 0 });
    }
  }

  it('opens a per-application run and completes it', async () => {
    const instance = new PerAppTask();
    const rec = recorderDouble();
    instance.recorder = rec;

    await instance.runOne();

    expect(rec.calls).toEqual(['start', 'succeed']);
  });

  it('does not fail the task when the completion write fails', async () => {
    const instance = new PerAppTask();
    instance.recorder = recorderDouble({
      succeedRun: async () => {
        throw new Error('write failed');
      },
    });

    // A task whose work succeeded must not be reported as failed because the
    // bookkeeping write did not land.
    await expect(instance.runOne()).resolves.toBeUndefined();
  });

  it('returns null when the repo binds no recorder', async () => {
    class Unbound extends AbstractScheduledTask {
      protected async handleScheduledTask(): Promise<void> {
        return undefined;
      }
      public async tryRun(): Promise<boolean> {
        const handle = await this.createApplicationRun('sync', 'app-1');
        return handle === null;
      }
    }

    expect(await new Unbound().tryRun()).toBe(true);
  });
});

describe('TaskRegistry', () => {
  class Noop extends AbstractScheduledTask {
    protected async handleScheduledTask(): Promise<void> {
      return undefined;
    }
  }

  it('keeps tasks grouped by phase', () => {
    const registry = new TaskRegistry();
    const first = new Noop();
    const second = new Noop();
    const third = new Noop();

    registry.register(1, first).register(2, second).register(1, third);

    expect(registry.tasksForPhase(1)).toEqual([first, third]);
    expect(registry.tasksForPhase(2)).toEqual([second]);
  });

  it('reports phases in ascending order', () => {
    const registry = new TaskRegistry();
    registry.register(2, new Noop()).register(1, new Noop());

    // Inserting at index 0 cannot silently reclassify the tasks after it,
    // which is what a flat list with a slice() boundary invites.
    expect(registry.phases()).toEqual([1, 2]);
  });

  it('returns an empty list for an unregistered phase', () => {
    expect(new TaskRegistry().tasksForPhase(9)).toEqual([]);
  });
});

describe('describeFailure', () => {
  /**
  A task whose only job is to fail, so the recorded message is the only thing
  under test.
  */
  class FailingTask extends AbstractScheduledTask {
    public constructor(private readonly recorder: TaskRunRecorder) {
      super();
    }

    protected override getTaskType(): string {
      return 'failing_task';
    }

    protected override createRunRecorder(): TaskRunRecorder {
      return this.recorder;
    }

    protected override swallowErrors(): boolean {
      return true;
    }

    protected override handleScheduledTask(): Promise<void> {
      throw new Error('boom');
    }
  }

  it("writes the error's own message by default", async () => {
    // The default is right for a console log and wrong for a row a user reads
    // back, which is why the override below exists at all.
    const recorder = recorderDouble();
    await new FailingTask(recorder).handle(EVENT, ENV, CTX);
    expect(recorder.calls).toContain('fail');
  });

  it('lets a consumer redact the message before it is persisted', async () => {
    // The case the seam exists for: a failure message carrying a bearer token or
    // a signed URL must not reach a row that `GET /user/processing/task-runs`
    // hands back. A consumer with that exposure routes the value through its own
    // redactor here.
    const written: string[] = [];
    class RedactingTask extends FailingTask {
      protected override describeFailure(error: unknown): string {
        const message = error instanceof Error ? error.message : String(error);
        return message.replaceAll(/ya29\.\w+/g, 'ya29.[redacted]');
      }
    }

    const recorder = recorderDouble({
      failRun: async (_runId, errorMessage) => {
        written.push(errorMessage);
      },
    });

    class LeakyTask extends RedactingTask {
      protected override handleScheduledTask(): Promise<void> {
        throw new Error('refresh failed for ya29.a0AfH6');
      }
    }

    await new LeakyTask(recorder).handle(EVENT, ENV, CTX);
    expect(written[0]).toBe('refresh failed for ya29.[redacted]');
    expect(written[0]).not.toContain('a0AfH6');
  });
});
