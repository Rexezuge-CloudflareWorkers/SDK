/**
 * `@rexezuge/web` — the SPA layer of the kit.
 *
 * React primitives, the hooks every app's shell needs, and the one API client.
 * Every export is the converged form of a framework that lived as copies inside
 * the nine consumer repos; see the `## Provenance` block at the top of each
 * module for what it replaced and which copy won.
 *
 * ```ts
 * import { Button, Card, createApiClient, useCurrentUser, useNotice, useSpaLanguage } from '@rexezuge/web';
 * ```
 *
 * ## What a consumer must provide
 *
 * - **The CSS variables the class-based components read.** All six Tailwind
 *   repos define the same set, so this is usually already present:
 *   `--color-accent`, `--color-accent-dim`, `--color-border`,
 *   `--color-surface-base`, `--color-surface-1..4`,
 *   `--color-text-primary`, `--color-text-secondary`, `--color-text-muted`, and
 *   `--color-{success,error,warning,info,neutral}-{bg,text}`.
 * - **`animate-spin`**, for `Spinner` (and therefore `Button`'s busy state).
 *   Tailwind ships it; a non-Tailwind app defines the keyframes once.
 * - **A dependency on `@rexezuge/errors`**, which `api.ts` imports for
 *   `ServiceError` and the status classes.
 *
 * ## What is deliberately not here
 *
 * Domain badges (`ConnectionBadge`, `TaskRunStatusBadge`, …), the OAuth
 * `?oauth2=` notice seeding, the D1 bookmark header, WebDAV `207` handling, the
 * authed-first public fallback, and every app's `SUPPORTED_LANGUAGES`. Each had
 * exactly one consumer, so each stays with it — see `constants.ts` and the
 * per-module provenance notes for the list.
 */

export { Badge, badgeBaseClass, badgeClass, badgeVariantClass } from './Badge';
export type { BadgeProps, BadgeVariant } from './Badge';

export { Button, buttonBaseClass, buttonClass, buttonSizeClass, buttonVariantClass } from './Button';
export type { ButtonProps, ButtonSize, ButtonVariant } from './Button';

export { Card, cardClass, cardHeaderClass, cardTitleClass, CardHeader, CardTitle } from './Card';
export type { CardHeaderProps, CardProps, CardTitleProps } from './Card';

export { FocusInput } from './FocusInput';
export type { FocusInputProps } from './FocusInput';

export { Input, Label, Select, Textarea, fieldClass } from './Input';
export type { InputProps, LabelProps, SelectProps, TextareaProps } from './Input';

export { LoadingButton } from './LoadingButton';
export type { LoadingButtonProps } from './LoadingButton';

export { Pagination, clampPage, pageCountFor, pageWindow } from './Pagination';
export type { PaginationLabels, PaginationProps } from './Pagination';

export { Spinner } from './Spinner';
export type { SpinnerProps } from './Spinner';

export {
  btnBase,
  btnBlueStyle,
  btnGreenStyle,
  btnSmallStyle,
  buttonColors,
  cardStyle,
  inputStyle,
  paginationBtnStyle,
  tableCardStyle,
  tdStyle,
  theme,
  thStyle,
} from './theme';

export { cn } from './utils';
export type { ClassDictionary, ClassValue } from './utils';

export { COPY_FEEDBACK_TIMEOUT_MS, NOTICE_TIMEOUT_MS, ZERO_TRUST_AUTHENTICATION_PATH } from './constants';

export { useNotice } from './useNotice';
export type { Notice, NoticeKind, ShowNotice, UseNoticeOptions, UseNoticeResult } from './useNotice';

export {
  canonicalizeLanguageTag,
  DEFAULT_FALLBACK_LANGUAGE,
  DEFAULT_LANGUAGE_STORAGE_KEY,
  DEFAULT_SUPPORTED_LANGUAGES,
  resolveLanguageTag,
  useSpaLanguage,
} from './useSpaLanguage';
export type { LanguageTag, UseSpaLanguageOptions, UseSpaLanguageResult } from './useSpaLanguage';

export { CURRENT_USER_PATH, useCurrentUser } from './useCurrentUser';
export type { CurrentUser, UseCurrentUserOptions, UseCurrentUserResult } from './useCurrentUser';

export { buildQuery, createApiClient, HttpStatusError, MAX_ERROR_MESSAGE_LENGTH } from './api';
export type { ApiClient, ApiRequestInit, CreateApiClientOptions, FetchFn, QueryParams, QueryValue } from './api';
