import { HttpServiceError } from './HttpServiceError';

/**
 * 415 — the body's content type is not one the endpoint can parse.
 */
class UnsupportedMediaTypeError extends HttpServiceError<'UnsupportedMediaType'> {
  constructor(message?: string) {
    super('UnsupportedMediaType', message);
  }
}

export { UnsupportedMediaTypeError };
