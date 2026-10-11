import { HttpServiceError } from './HttpServiceError';

/**
 * 404 — no such resource.
 */
class NotFoundError extends HttpServiceError<'NotFound'> {
  constructor(message?: string) {
    super('NotFound', message);
  }
}

export { NotFoundError };
