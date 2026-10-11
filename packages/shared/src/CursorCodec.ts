/**
 * Canonical opaque-cursor codec, plus the `Page<T>` shape it produces.
 *
 * ## Provenance
 *
 * Converged from ChordDHT-Tracker's `utils/Cursor.ts` (a `Cursor` class + a
 * `Page<T>` type), Edge-Git's `backend-data/.../CursorUtil.ts` (a `CursorUtil`
 * class that adds `decodeOrThrow` + `isValidCursor`) and Mail-Otter's
 * `CursorUtil.ts` (the minimal `encode`/`decode` pair). All three hand-rolled
 * DAO pagination cursors and all three converged on `btoa(JSON.stringify(...))`
 * / `JSON.parse(atob(...))`. Canonical name is **`CursorCodec`**; the cursor is an
 * opaque token, so callers pass it through and never inspect it.
 *
 * ## Design decisions
 *
 * - The cursor is `btoa`/`atob`, which works in workerd *and* Node 24 (both
 *   expose browser globals now). No `Buffer` is used, so the same bundle runs in
 *   both.
 * - `decode` never throws: a malformed or tampered cursor is `undefined`, which a
 *   DAO reads as "no cursor, start from the beginning" rather than an error an
 *   attacker can provoke. `decodeOrThrow` and `isValidCursor` are kept from
 *   Edge-Git for the call sites that *want* the strict behaviour.
 * - **Layer 0 stays dependency-free.** Edge-Git's `decodeOrThrow` threw its
 *   `@edge-git/backend-errors` `BadRequestError`; the shared package imports
 *   nothing, so it throws a plain `Error` and leaves the HTTP mapping to the
 *   layer that owns the error taxonomy (the same "throw plain `Error`, map above"
 *   rule `Identity`/`EmailUtil` follow).
 */
interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor?: string;
}

class CursorCodec {
  public static encode(value: unknown): string {
    return btoa(JSON.stringify(value));
  }

  /**
   * Decode a cursor, or `undefined` for a missing/malformed one.
   *
   * `atob`/`JSON.parse` throw on bad input; the `try` turns that into `undefined`
   * so a corrupt cursor degrades to a first page instead of an uncaught throw.
   */
  public static decode<T>(cursor: string | undefined | null): T | undefined {
    if (!cursor) return undefined;
    try {
      return JSON.parse(atob(cursor)) as T;
    } catch {
      return undefined;
    }
  }

  /**
   * Decode a cursor that is known to be present, throwing a plain `Error` on
   * malformed input.
   *
   * For a call site that treats a bad cursor as a client error; the HTTP mapping
   * to `BadRequest` is the caller's layer's job (see the file header).
   *
   * The parameter is `string`, not `string | undefined | null`, and there is no
   * `undefined` in the return. Two behaviours in one signature — "absent" and
   * "malformed" — meant a caller could not tell them apart without re-reading
   * the input it had already passed. Deciding absence belongs to the caller;
   * this function's whole contract is that a cursor which *is* present either
   * decodes or throws. Use {@link decode} when absence is an ordinary answer.
   */
  public static decodeOrThrow<T>(cursor: string): T {
    try {
      return JSON.parse(atob(cursor)) as T;
    } catch {
      throw new Error('Invalid cursor');
    }
  }

  /**
   * Whether a cursor is well-formed. A missing cursor is valid (first page).
   */
  public static isValidCursor(cursor: string | undefined | null): boolean {
    if (!cursor) return true;
    try {
      JSON.parse(atob(cursor));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Build a `Page`, omitting `nextCursor` entirely on the last page rather than
   * carrying an explicit `undefined`.
   */
  public static page<T>(items: readonly T[], nextCursor?: string): Page<T> {
    return nextCursor ? { items, nextCursor } : { items };
  }
}

export { CursorCodec };
export type { Page };
