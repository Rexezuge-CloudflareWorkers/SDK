import { CATALOG } from './CATALOG';
import type { HttpErrorType } from './CATALOG';
import { ServiceError } from './ServiceError';
import type { ServiceErrorOptions } from './ServiceError';

/**
 * A `ServiceError` with a fixed HTTP status and type from the catalog.
 *
 * Concrete subclasses add nothing but a name, so they are one-liners:
 * `class NotFoundError extends HttpServiceError<'notFound'> {}`.
 */
abstract class HttpServiceError<TType extends HttpErrorType> extends ServiceError {
  constructor(errorType: TType, message?: string, options?: ServiceErrorOptions) {
    const definition = CATALOG[errorType];
    super(definition.status, errorType, message ?? definition.defaultMessage, options);
  }
}

export { HttpServiceError };
