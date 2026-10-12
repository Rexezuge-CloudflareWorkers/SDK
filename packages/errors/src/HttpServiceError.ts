import { CATALOG } from './CATALOG.ts';
import type { HttpErrorType } from './CATALOG.ts';
import { ServiceError } from './ServiceError.ts';
import type { ServiceErrorOptions } from './ServiceError.ts';

/**
 * A `ServiceError` with a fixed HTTP status and type from the catalog.
 *
 * Concrete subclasses add nothing but a name, so they are one-liners:
 * `class NotFoundError extends HttpServiceError<'NotFound'> {}`.
 */
abstract class HttpServiceError<TType extends HttpErrorType> extends ServiceError {
  constructor(errorType: TType, message?: string, options?: ServiceErrorOptions) {
    const definition = CATALOG[errorType];
    super(definition.status, errorType, message ?? definition.defaultMessage, options);
  }
}

export { HttpServiceError };
