import {
  BadGatewayError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  InternalServerError,
  MethodNotAllowedError,
  NotFoundError,
  NotImplementedError,
  PayloadTooLargeError,
  PreconditionFailedError,
  RateLimitedError,
  ServiceError,
  ServiceUnavailableError,
  UnauthorizedError,
  UnsupportedMediaTypeError,
} from '@rexezuge/errors';

/**
 * The SPA's request path.
 *
 * ## Provenance
 *
 * `lib/api.ts` in **CalDAV-Bridge**, **Durable-DAV**, **Durable-DAV-Router**,
 * **Edge-Git**, **Edge-Sonic**, **Mail-Otter** and **AWS-AccessBridge** — seven
 * copies that all drift on the same three decisions, settled here as follows.
 *
 * **1. Error model.** Six of the seven define a private `BackendError`
 * (`{ message, errorType, status }`) and hand-roll the status→branch mapping at
 * every call site; AWS defines `ApiError` (`{ status, message }`) plus an
 * `ApiResult{ok,status,data,error}` shape that its own guide records as
 * abandoned — every admin tab bypassed it, which is how nine of its seventeen
 * functions ended up with no caller. The kit replaces both with the family
 * taxonomy: every rejection is a `ServiceError`, so `error.status`,
 * `error.type`, `error.retryable` and `instanceof ServiceError` are available
 * without a per-repo error class, and `ServiceError.from` covers the
 * transport-level failures the private classes swallowed.
 *
 * **2. Error body decoding.** Converged from the three variants that exist:
 *
 * - The **AWS envelope** `{ Exception: { Type, Message } }`, read first in all
 *   copies.
 * - The **legacy** `{ error, message }` shape, where Durable-DAV also reads a
 *   string `error` as the *type* — otherwise a legacy body produced a correct
 *   message and a `null` type, which sent it through the generic fallback and
 *   lost the specific wording.
 * - **Edge-Sonic's prose test** for a non-JSON body: an Access login page or a
 *   proxy's HTML error page is not a message an operator can act on, so markup
 *   is reported as absent rather than quoted into a notice bar. Short,
 *   single-line, tag-free text *is* surfaced, truncated.
 * - **Truncation** at 500 characters, from every copy that has one: an
 *   unbounded error string from a proxy page is a rendering hazard.
 * - **`text()` then `JSON.parse`, never `json()` with a `text()` fallback** —
 *   Edge-Sonic's comment records why the old shape cannot work: `json()`
 *   consumes the body stream before it fails to parse, so the second read
 *   returned `''` and the "not JSON" branch was unreachable.
 *
 * **3. Empty bodies.** Durable-DAV's fix is the one kept: a `204`, and an empty
 * body from an edge error page, resolve to `undefined` rather than throwing a
 * `SyntaxError` — which used to report a generic failure for an operation that
 * had actually succeeded (credential revoke). AWS-AccessBridge resolved the same
 * case to `{}`; `undefined` is the honest answer for "there is no body".
 *
 * ## What is deliberately not here
 *
 * - **The D1 session bookmark** (`x-d1-bookmark`, CalDAV-Bridge and
 *   Mail-Otter). It is module state threading a D1 replica pin through every
 *   `/user/*` request; the kit has no D1 client, so the header policy stays
 *   with the repos that own the binding.
 * - **`apiAuthedFirst`** (Edge-Git) — a public-fallback policy with
 *   fail-closed 401/403/404 handling, specific to that app's two-surface API.
 * - **WebDAV `readDav`** (Durable-DAV, Durable-DAV-Router) — it accepts `207
 *   Multi-Status` as success, which is a WebDAV rule, not an HTTP rule. A
 *   consumer needing XML calls `client.request` and reads `response.text()`
 *   itself.
 * - **The `/user` base path.** Edge-Sonic bakes it in; the others pass full
 *   paths. `baseUrl` is an option here, defaulting to empty, so the caller
 *   decides.
 */

/**
The `fetch` shape a client is built on: same-origin by default, no token in JavaScript.
*/
type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

/**
A query-string value. `null`/`undefined`/`''` are omitted, as in every copy.
*/
type QueryValue = string | number | boolean | null | undefined;

type QueryParams = Record<string, QueryValue | readonly QueryValue[]>;

interface ApiRequestInit {
  method?: string;
  /**
  Serialized as JSON with a matching `Content-Type`.
  */
  body?: unknown;
  headers?: HeadersInit;
  signal?: AbortSignal | null;
}

interface CreateApiClientOptions {
  /**
  Prepended to every path; `''` (the default) sends the path as given.
  */
  baseUrl?: string;
  /**
  Headers merged into every request; a per-request header wins over these.
  */
  headers?: HeadersInit;
  /**
  Passed through to `fetch`; omitted leaves the browser default.
  */
  credentials?: RequestCredentials;
  /**
  Truncation limit for a server-provided error message. Defaults to 500.
  */
  maxErrorMessageLength?: number;
}

interface ApiClient {
  /**
  One request. Throws a `ServiceError`; resolves to the parsed JSON body.
  */
  request<T>(path: string, init?: ApiRequestInit): Promise<T>;
  get<T>(path: string, params?: QueryParams): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  put<T>(path: string, body?: unknown): Promise<T>;
  patch<T>(path: string, body?: unknown): Promise<T>;
  delete<T>(path: string, body?: unknown): Promise<T>;
}

/**
Default truncation for a server-provided message.
*/
const MAX_ERROR_MESSAGE_LENGTH = 500;

/**
 * Statuses the family taxonomy has a class for, mapped to it.
 *
 * The map is keyed by status rather than by the server's `Exception.Type`
 * because the status is the fact that survives a rolling deploy: a body from an
 * older Worker build still carries today's status, while a `Type` may be
 * spelled either way.
 */
const HTTP_ERROR_CLASSES: Readonly<Record<number, new (message?: string) => ServiceError>> = {
  400: BadRequestError,
  401: UnauthorizedError,
  403: ForbiddenError,
  404: NotFoundError,
  405: MethodNotAllowedError,
  409: ConflictError,
  412: PreconditionFailedError,
  413: PayloadTooLargeError,
  415: UnsupportedMediaTypeError,
  429: RateLimitedError,
  500: InternalServerError,
  501: NotImplementedError,
  502: BadGatewayError,
  503: ServiceUnavailableError,
};

/**
 * A failure whose only fact is its HTTP status: a status the catalog has no
 * class for (451, 418, a proxy's own 5xx), or a 2xx body that is not JSON.
 *
 * It exists so the thrown value is *always* a `ServiceError` — a caller
 * branching on `instanceof ServiceError` does not have to know which statuses
 * the catalog happens to cover.
 */
class HttpStatusError extends ServiceError {
  constructor(status: number, message: string, type: string | null) {
    super(status, type ?? `HttpStatus${status}`, message);
  }
}

interface DecodedErrorBody {
  /**
  What the server said, or `null` when it said nothing usable.
  */
  message: string | null;
  /**
  The server's machine-readable code, when it sent one.
  */
  type: string | null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

/**
Rejects control characters: that is what separates text from a binary or a document.
*/
// eslint-disable-next-line no-control-regex -- rejecting control characters IS the test
const CONTROL_CHARACTER = /[\u0000-\u001F\u007F]/;

/**
 * Whether a non-JSON error body is text worth showing rather than markup or a
 * blob. Deliberately conservative: the cost of wrongly refusing is the generic
 * status sentence, and the cost of wrongly accepting is an HTML page in a
 * notice bar.
 */
function isProbablyProse(raw: string, maxLength: number): boolean {
  if (raw.length === 0 || raw.length > maxLength || raw.includes('<')) {
    return false;
  }
  return !CONTROL_CHARACTER.test(raw);
}

function decodeJsonError(payload: unknown, status: number, maxLength: number): DecodedErrorBody {
  if (typeof payload === 'string') {
    const message = payload.trim();
    return { message: message === '' ? null : truncate(message, maxLength), type: null };
  }
  if (typeof payload !== 'object' || payload === null) {
    return { message: null, type: null };
  }
  // Three dialects, newest first: the AWS envelope, the unified `{error:
  // {code,message}}` object, and the legacy flat `{error, message}`.
  const envelope = payload as {
    Exception?: { Type?: unknown; Message?: unknown };
    error?: unknown;
    message?: unknown;
    code?: unknown;
  };
  const nestedError =
    typeof envelope.error === 'object' && envelope.error !== null ? (envelope.error as { message?: unknown; code?: unknown }) : null;
  const type =
    readString(envelope.Exception?.Type) ??
    (typeof envelope.error === 'string' ? readString(envelope.error) : null) ??
    readString(nestedError?.code) ??
    readString(envelope.code) ??
    null;
  const message =
    readString(envelope.Exception?.Message) ??
    readString(envelope.message) ??
    (typeof envelope.error === 'string' ? readString(envelope.error) : null) ??
    readString(nestedError?.message) ??
    null;
  if (message !== null) {
    return { message: truncate(message, maxLength), type };
  }
  if (type !== null) {
    // The server named the failure but gave no sentence for it.
    return { message: `${type} (HTTP ${status})`, type };
  }
  return { message: null, type: null };
}

function decodeErrorBody(text: string, status: number, maxLength: number): DecodedErrorBody {
  const trimmed = text.trim();
  if (trimmed === '') {
    return { message: null, type: null };
  }
  try {
    return decodeJsonError(JSON.parse(trimmed) as unknown, status, maxLength);
  } catch {
    return { message: isProbablyProse(trimmed, maxLength) ? truncate(trimmed, maxLength) : null, type: null };
  }
}

function mergeHeaders(base: HeadersInit | undefined, overrides?: HeadersInit): Headers {
  const headers = new Headers(base);
  if (overrides === undefined) {
    return headers;
  }
  for (const [name, value] of new Headers(overrides)) {
    headers.set(name, value);
  }
  return headers;
}

function isQueryList(value: QueryValue | readonly QueryValue[]): value is readonly QueryValue[] {
  return Array.isArray(value);
}

/**
 * Builds a query string, with the leading `?` and without it when empty.
 *
 * `null`, `undefined` and `''` are dropped rather than sent as empty
 * parameters, and an array value repeats the key — both as in the copies this
 * replaces.
 */
function buildQuery(params: QueryParams): string {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    if (isQueryList(value)) {
      for (const entry of value) {
        if (entry !== undefined && entry !== null && entry !== '') {
          search.append(name, String(entry));
        }
      }
      continue;
    }
    search.set(name, String(value));
  }
  const encoded = search.toString();
  return encoded === '' ? '' : `?${encoded}`;
}

/**
 * Builds a client over a `fetch` implementation.
 *
 * ```ts
 * const api = createApiClient(fetch, { baseUrl: '/user' });
 * const me = await api.get<CurrentUser>('/me');
 * ```
 *
 * The `fetchFn` parameter is what makes this testable without a network and
 * swappable for an instrumented wrapper; in a browser it is the global `fetch`.
 * Memoize the client (a module constant, or `useMemo`) — `useCurrentUser`
 * deliberately does not re-fetch when a new client instance appears, but a new
 * instance per render still churns.
 */
function createApiClient(fetchFn: FetchFn, options: CreateApiClientOptions = {}): ApiClient {
  const baseUrl = options.baseUrl ?? '';
  const maxErrorMessageLength = options.maxErrorMessageLength ?? MAX_ERROR_MESSAGE_LENGTH;

  async function request<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
    const method = (init.method ?? 'GET').toUpperCase();
    const url = `${baseUrl}${path}`;
    const hasBody = init.body !== undefined;
    const headers = mergeHeaders(options.headers, init.headers);
    // Same-origin only, and no token in JavaScript: the Cloudflare Access
    // session cookie rides along under the default credentials, and there is no
    // place for a token to leak to. Both defaults yield to an explicit header
    // — a consumer that wants XML passes its own `Accept`.
    if (!headers.has('Accept')) {
      headers.set('Accept', 'application/json');
    }
    if (hasBody && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    const requestInit: RequestInit = { method, headers };
    if (options.credentials !== undefined) {
      requestInit.credentials = options.credentials;
    }
    if (hasBody) {
      requestInit.body = JSON.stringify(init.body);
    }
    if (init.signal !== undefined && init.signal !== null) {
      requestInit.signal = init.signal;
    }

    const context = `${method} ${url}`;
    let response: Response;
    try {
      response = await fetchFn(url, requestInit);
    } catch (cause) {
      // The transport never answered — offline, DNS, CORS, an aborted signal.
      // There is no status to report, so the failure normalizes through
      // `ServiceError.from` like any other unknown throw. A caller that cancels
      // its own request therefore sees a 500-shaped error too; the taxonomy has
      // no "aborted" class, and swallowing it here would hide real transport
      // failures. A caller that cancels should not surface the rejection.
      throw ServiceError.from(cause);
    }
    if (!response.ok) {
      throw await toServiceError(response);
    }
    return readJson<T>(response, context);
  }

  async function toServiceError(response: Response): Promise<ServiceError> {
    let text = '';
    try {
      text = await response.text();
    } catch {
      // The body could not be read at all — a reset after the headers. The
      // status is still the one true thing about the request, and the catalog
      // default message says more than anything this could invent.
    }
    const decoded = decodeErrorBody(text, response.status, maxErrorMessageLength);
    if (Object.hasOwn(HTTP_ERROR_CLASSES, response.status)) {
      const ErrorClass = HTTP_ERROR_CLASSES[response.status];
      // A `null` message leaves the catalog's default in place, which is a
      // better sentence than anything the client could invent.
      return new ErrorClass(decoded.message ?? undefined);
    }
    return new HttpStatusError(response.status, decoded.message ?? `Request failed with status ${response.status}.`, decoded.type);
  }

  async function readJson<T>(response: Response, context: string): Promise<T> {
    if (response.status === 204) {
      return undefined as T;
    }
    let text: string;
    try {
      text = await response.text();
    } catch (cause) {
      throw ServiceError.from(cause);
    }
    if (text.trim() === '') {
      return undefined as T;
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      // A 2xx body that is not JSON is an HTML error page from a proxy. It must
      // surface as a ServiceError, not a SyntaxError, so the caller's error
      // handling has one shape to recognize.
      throw new HttpStatusError(response.status, `Malformed response body: ${context}`, null);
    }
  }

  return {
    request,
    get: async <T>(path: string, params?: QueryParams): Promise<T> =>
      request<T>(`${path}${params === undefined ? '' : buildQuery(params)}`),
    post: async <T>(path: string, body?: unknown): Promise<T> => request<T>(path, { method: 'POST', body }),
    put: async <T>(path: string, body?: unknown): Promise<T> => request<T>(path, { method: 'PUT', body }),
    patch: async <T>(path: string, body?: unknown): Promise<T> => request<T>(path, { method: 'PATCH', body }),
    delete: async <T>(path: string, body?: unknown): Promise<T> => request<T>(path, { method: 'DELETE', body }),
  };
}

export { buildQuery, createApiClient, HttpStatusError, MAX_ERROR_MESSAGE_LENGTH };
export type { ApiClient, ApiRequestInit, CreateApiClientOptions, FetchFn, QueryParams, QueryValue };
