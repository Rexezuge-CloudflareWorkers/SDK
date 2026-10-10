/**
 * Identifiers behind an interface, so ids can be pinned in a test.
 *
 * ## Provenance
 *
 * Taken from ChordDHT-Tracker's `IdGenerator.ts` — the only repo that factored
 * id generation behind a seam. `CryptoIdGenerator` is the production path (one
 * `crypto.randomUUID`), `FixedIdGenerator` is the test double that replays a
 * queued set and then synthesizes deterministic stand-ins so a test can assert
 * on the exact ids a code path produced.
 */
interface IdGenerator {
  randomUUID(): string;
}

class CryptoIdGenerator implements IdGenerator {
  public randomUUID(): string {
    return crypto.randomUUID();
  }
}

class FixedIdGenerator implements IdGenerator {
  private readonly queue: string[] = [];
  private counter = 0;

  constructor(ids: string | string[] = []) {
    const initial: string[] = Array.isArray(ids) ? ids : [ids];
    for (const id of initial) {
      if (id) this.queue.push(id);
    }
  }

  public queueId(id: string): void {
    this.queue.push(id);
  }

  public randomUUID(): string {
    const next: string | undefined = this.queue.shift();
    if (next !== undefined) return next;
    this.counter += 1;
    return `fixed-uuid-${this.counter.toString()}`;
  }
}

export { CryptoIdGenerator, FixedIdGenerator };
export type { IdGenerator };
