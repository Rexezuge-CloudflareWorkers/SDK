export { CATALOG } from './CATALOG.ts';
export type { HttpErrorDefinition, HttpErrorType } from './CATALOG.ts';
export { ServiceError } from './ServiceError.ts';
export type { ServiceErrorOptions, ErrorHttpPayload } from './ServiceError.ts';
export { HttpServiceError } from './HttpServiceError.ts';
export { BadRequestError } from './BadRequestError.ts';
export { UnauthorizedError } from './UnauthorizedError.ts';
export { ForbiddenError } from './ForbiddenError.ts';
export { NotFoundError } from './NotFoundError.ts';
export { MethodNotAllowedError } from './MethodNotAllowedError.ts';
export { ConflictError } from './ConflictError.ts';
export { PreconditionFailedError } from './PreconditionFailedError.ts';
export { PayloadTooLargeError } from './PayloadTooLargeError.ts';
export { UnsupportedMediaTypeError } from './UnsupportedMediaTypeError.ts';
export { RateLimitedError } from './RateLimitedError.ts';
export { InternalServerError, DefaultInternalServerError } from './InternalServerError.ts';
export { NotImplementedError } from './NotImplementedError.ts';
export { BadGatewayError } from './BadGatewayError.ts';
export { ServiceUnavailableError } from './ServiceUnavailableError.ts';
export { DatabaseError } from './DatabaseError.ts';
export {
  NonRetryableError,
  OAuth2TokenNonRetryableError,
  OAuth2TokenRetryableError,
  OutcomeError,
  ProviderApiNonRetryableError,
  ProviderApiRetryableError,
  RetryableError,
} from './OutcomeError.ts';
export type { ErrorResponse } from './ErrorResponse.ts';
