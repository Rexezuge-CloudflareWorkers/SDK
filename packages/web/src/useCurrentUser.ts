import { useCallback, useEffect, useRef, useState } from 'react';
import { ServiceError } from '@rexezuge/errors';
import type { ApiClient } from './api';

/**
 * The signed-in account, fetched once on mount.
 *
 * ## Provenance
 *
 * `hooks/useCurrentUser.ts` in **CalDAV-Bridge**, **Durable-DAV**,
 * **Durable-DAV-Router**, **Edge-Git**, **Edge-Sonic** and **Mail-Otter** — six
 * copies that differ on the three questions this hook exists to answer:
 *
 * 1. **Who fetches.** CalDAV-Bridge, Edge-Git, Edge-Sonic and Mail-Otter call a
 *    module-level `loadCurrentUser()` from `services/userService`; Durable-DAV
 *    and Durable-DAV-Router call the same helper but keep the client injectable.
 *    The kit normalizes to the injectable form: the hook takes the client, so
 *    nothing about the request path is baked in and a test hands it a stub.
 * 2. **What a failure means.** Durable-DAV-Router records the bug in a comment:
 *    `authorized` was set to `false` for *any* failure, so a 500 or a dropped
 *    connection rendered "Sign In With Cloudflare Access" to a caller who was
 *    signed in — and the only way back was a hard reload. Its fix is a separate
 *    `error` flag meaning "we could not find out", rendered as a retry. That is
 *    the shape here: `error` carries the failure, `user` stays `null`, and the
 *    caller decides what a retry looks like. A 401 is not special-cased — a 401
 *    *is* an error, and a shell that renders a sign-in prompt from it should do
 *    so because the app says so.
 * 3. **Effect dependencies.** Durable-DAV documents the other half of the bug:
 *    the effect listed `onError` (its only dependency), `SpaApp` passed an
 *    inline arrow, so the effect re-ran on every render and issued an
 *    unbounded stream of `GET /user/me` from first paint. The kit takes the
 *    same cure: the client is read through a ref, and the effect is keyed on
 *    `reloadKey` alone. A caller can pass a fresh client every render and the
 *    request count is unchanged.
 *
 * ## Normalization
 *
 * `useCurrentUser(client)` returns `{ user, loading, error, reload }`. The
 * `authorized` tri-state (`null`/`true`/`false`) is gone: `loading` already
 * distinguishes "in flight" from "answered", and `error` distinguishes
 * "answered badly" from "not signed in" — a caller that wants `authorized`
 *    derives it as `loading ? null : user !== null`. `setUser` is gone too; a
 *    change to the account is a refresh (`reload()`), which is what the sources
 *    do at every call site anyway.
 */

/** The account shape a caller reads. `preferredLanguage` is what `useSpaLanguage` consumes. */
interface CurrentUser {
  preferredLanguage?: string | null;
}

interface UseCurrentUserOptions {
  /** The path to GET. Defaults to `/user/me`, the family's profile route. */
  path?: string;
}

interface UseCurrentUserResult<TUser> {
  /** The account, or `null` until it loads (and after a failure). */
  user: TUser | null;
  /** `true` while the request is in flight, including the first one. */
  loading: boolean;
  /** The normalized failure, or `null`. A `ServiceError`, always. */
  error: ServiceError | null;
  /** Re-runs the request. */
  reload: () => void;
}

/** The profile route every repo in the family serves. */
const CURRENT_USER_PATH = '/user/me';

function useCurrentUser<TUser = CurrentUser>(
  client: ApiClient,
  { path = CURRENT_USER_PATH }: Readonly<UseCurrentUserOptions> = {},
): UseCurrentUserResult<TUser> {
  const [user, setUser] = useState<TUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ServiceError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Read through a ref so a caller's fresh client instance cannot re-run the
  // effect; refreshing is explicit, through `reload`.
  const clientRef = useRef(client);
  useEffect(() => {
    clientRef.current = client;
  }, [client]);

  const reload = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    clientRef.current
      .get<TUser>(path)
      .then((me) => {
        if (cancelled) {
          return;
        }
        setUser(me);
        setError(null);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }
        // Normalized here as well as in the client: a client that is not this
        // package's (`createApiClient`) may throw anything, and a hook that
        // promises a `ServiceError` should deliver one.
        setError(ServiceError.from(cause));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, reloadKey]);

  return { user, loading, error, reload };
}

export { CURRENT_USER_PATH, useCurrentUser };
export type { CurrentUser, UseCurrentUserOptions, UseCurrentUserResult };
