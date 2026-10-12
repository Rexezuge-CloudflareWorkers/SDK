import { EnvParser } from './EnvParser.ts';
import { DEFAULT_SITE_URL } from './ConfigurationDefaults.ts';

/**
 * The base class every consumer's `AppConfiguration` extends.
 *
 * Converged from the six `config/AppConfiguration.ts` files and Mail-Meow's
 * `config/AppConfig.ts` (the same class under a different name — consumers
 * adapt to this one). The family's design — a thin facade over typed section
 * objects, each owning one group of getters — is kept, minus the sections,
 * which are per-project by nature: a consumer subclasses this and composes its
 * own sections (limits, auth, replication …), each of which reads the env once
 * through `EnvParser`.
 *
 * `validate()` returns warnings rather than throwing: a config typo must be a
 * startup log line, not a 500 on a request path.
 */
abstract class AppConfiguration {
  protected constructor(protected readonly env: unknown) {}

  public static fromEnv<T extends AppConfiguration>(this: new (env: unknown) => T, env: unknown): T {
    return new this(env);
  }

  /**
   * The public origin, trailing slashes stripped. Callers concatenate paths
   * onto it, so a trailing `/` would double them in every generated link.
   */
  public getSiteUrl(): string {
    let url = EnvParser.string(this.env, 'SITE_URL', DEFAULT_SITE_URL);
    while (url.endsWith('/')) url = url.slice(0, -1);
    return url;
  }

  /** The deployment stage this configuration believes itself in. */
  public getEnvironment(): string {
    return EnvParser.string(this.env, 'ENVIRONMENT', 'development');
  }

  /**
   * Warnings for suspicious settings, logged at startup. The base checks the
   * one the whole family agrees on — a dev bypass left enabled in production;
   * a subclass appends its own.
   */
  public validate(): string[] {
    const warnings: string[] = [];
    const environment = this.getEnvironment();
    if (environment === 'production') {
      if (EnvParser.boolean(this.env, 'DEMO_MODE', 'false')) {
        warnings.push('DEMO_MODE is enabled in production — every request will bypass authentication.');
      }
      if (EnvParser.readString(this.env, 'DEV_AUTH_EMAIL') !== undefined) {
        warnings.push('DEV_AUTH_EMAIL is set in production — a fixed identity can authenticate.');
      }
    }
    return warnings;
  }

  /** The raw env, for subclasses that need a key this base does not know. */
  protected raw(): unknown {
    return this.env;
  }
}

export { AppConfiguration };
