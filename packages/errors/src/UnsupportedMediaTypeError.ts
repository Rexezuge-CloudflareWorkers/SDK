import { HttpServiceError } from './HttpServiceError';

/**
 * 415 — the body's content type is not one the endpoint can parse.
 */
class UnsupportedMediaTypeError extends HttpServiceError<'unsupportedMediaType'> {
  constructor(message?: string) {
    super('unsupportedMediaType', message);
  }
}

export { UnsupportedMediaTypeError };
