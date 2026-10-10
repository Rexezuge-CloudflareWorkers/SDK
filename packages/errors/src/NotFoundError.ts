import { HttpServiceError } from './HttpServiceError';

/**
 * 404 — no such resource.
 */
class NotFoundError extends HttpServiceError<'notFound'> {
  constructor(message?: string) {
    super('notFound', message);
  }
}

export { NotFoundError };
