/**
 * Typed readers for a Worker `env` binding.
 *
 * Converged from `backend-runtime/src/config/EnvParser.ts` — effectively
 * identical in all six repos that have the file (Mail-Meow/CalDAV-Bridge call
 * their copy `ConfigurationManager` with the same three readers).
 *
 * The var table is `Record<string, string | undefined>` by contract: Cloudflare
 * passes every binding as a string, so a reader that returned `number` for
 * `MAX_*` would be inventing a parse that never happened. `boolean` is
 * presence-of-"true", and anything else is `false` — never "absent means true".
 */
class EnvParser {
  public static positiveInt(env: unknown, key: string, defaultValue: string): number {
    const value = this.readString(env, key);
    const parsed = Number(value ?? defaultValue);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : Number(defaultValue);
  }

  /**
   * Whether an explicitly-set numeric var is a usable positive integer.
   *
   * Used by `AppConfiguration.validate()` to *report* misconfiguration at
   * startup while still running with the default. The throwing counterpart
   * (`strictPositiveInt`) is gone: no caller opted in, and a fail-fast parse on
   * a request path would turn a config typo into a 500 rather than a warning.
   */
  public static isValidPositiveInt(env: unknown, key: string): boolean {
    const value = this.readString(env, key);
    if (value === undefined) return true;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0;
  }

  public static string(env: unknown, key: string, defaultValue: string): string {
    return this.readString(env, key) ?? defaultValue;
  }

  /**
   * A non-negative integer, zero included.
   *
   * Distinct from `positiveInt` because zero is a meaningful configuration for
   * retention and quota knobs ("keep nothing"), and a parser that rejected it
   * would silently substitute the default — so setting `0` in the dashboard
   * would appear to do nothing at all.
   */
  public static nonNegativeInt(env: unknown, key: string, defaultValue: string): number {
    const value = this.readString(env, key);
    const parsed = Number(value ?? defaultValue);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : Number(defaultValue);
  }

  public static boolean(env: unknown, key: string, defaultValue: string): boolean {
    return (this.readString(env, key) ?? defaultValue) === 'true';
  }

  /** The raw value, or undefined when unset. Public because presence checks (validate) need it. */
  public static readString(env: unknown, key: string): string | undefined {
    return (env as Record<string, string | undefined>)[key];
  }
}

export { EnvParser };
