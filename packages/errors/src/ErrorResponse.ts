/**
 * The AWS-style error envelope: `{ "Exception": { "Type": "...", "Message": "..." } }`.
 *
 * Optional members tolerate foreign or truncated payloads during
 * deserialization; serializers always emit both fields. The envelope is the
 * family's established wire format — the kit's `toErrorResponse()` owns it so
 * per-app route layers stop hand-rolling it.
 */
interface ErrorResponse {
  Exception?: {
    Type?: string;
    Message?: string;
  };
}

export type { ErrorResponse };
