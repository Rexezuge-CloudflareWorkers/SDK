/**
 * Defaults shared by the family's configuration layers.
 *
 * Converged from `backend-runtime/src/config/ConfigurationDefaults.ts` (five
 * repos) and the `ConfigurationManager` default table in the other four. Only
 * the values every repo agrees on live here; a project-specific default belongs
 * in that project's config section.
 */

/** Used when `SITE_URL` is unset — the value that renders correct absolute links in tests. */
const DEFAULT_SITE_URL = 'http://localhost:8787';

export { DEFAULT_SITE_URL };
