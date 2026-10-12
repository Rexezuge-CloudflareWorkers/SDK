/**
 * Minimal `Result` type for explicit error handling without exceptions.
 *
 * ## Provenance
 *
 * Converged from Edge-Git's `Result.ts` and ChordDHT-Tracker's `Result.ts`. The
 * two are byte-identical apart from a doc comment (Edge-Git added the header);
 * ChordDHT is the origin, Edge-Git the copy. Mail-Otter and the DAV repos are
 * the kind of repo this was ported *to*, so Edge-Git's documented form is kept
 * verbatim.
 *
 * When two variants are identical there is nothing stricter to choose; the
 * supported shape is `{ ok: true, value }` / `{ ok: false, error }` frozen at the
 * type level rather than thrown.
 */
type Ok<T> = { readonly ok: true; readonly value: T };
type Err<E> = { readonly ok: false; readonly error: E };
type Result<T, E = Error> = Ok<T> | Err<E>;

function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

function mapResult<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

function getOrThrow<T, E = Error>(result: Result<T, E>): T {
  // eslint-disable-next-line @typescript-eslint/only-throw-error -- rethrowing the carried error, whatever its type, is this function's whole contract; callers build the `Err` they get back.
  if (!result.ok) throw result.error;
  return result.value;
}

export { err, getOrThrow, isOk, mapResult, ok };
export type { Err, Ok, Result };
