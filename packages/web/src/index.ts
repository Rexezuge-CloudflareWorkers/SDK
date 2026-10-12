/**
 * `@rexezuge/web` — the SPA layer of the kit.
 *
 * React primitives, the hooks every app's shell needs, and the one API client.
 * Every export is the converged form of a framework that lived as copies inside
 * the nine consumer repos; see the `## Provenance` block at the top of each
 * module for what it replaced and which copy won.
 *
 * ```ts
 * import { AppPage, Button, Card, createApiClient, useCurrentUser, useNotice, useSpaLanguage } from '@rexezuge/web';
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
 * ## Glyphs in, strings out
 *
 * Three components (`RefreshButton`, `ReadOnlyField`, `TypeToConfirmModal`) take
 * their icon from `lucide-react`, which is why it is a peer rather than a
 * dependency. Everything *sayable* is a prop: no component here calls
 * `useTranslation`, because the app rendering a dialog knows what it says and a
 * kit that hard-codes English for it has taken over the app's string catalogue.
 *
 * The dividing line is deliberate. `Button` keeps using this package's own
 * `Spinner` rather than lucide's `Loader2` — chrome is cheap to draw, iconography
 * is not, and vendoring a glyph's path data freezes it at whatever version was
 * current when it was copied.
 *
 * ## Migrating the copies
 *
 * `codemods/` rewrites the family's `../components/…` imports onto this package
 * for every component converged here, and names the ones it has not. Those
 * imports are **relative**, so this is a separate transform from the
 * `@scope/pkg` one — see `codemods/src/web-components.ts`.
 *
 * ## What is deliberately not here
 *
 * Domain badges (`ConnectionBadge`, `TaskRunStatusBadge`, …), the OAuth
 * `?oauth2=` notice seeding, the D1 bookmark header, WebDAV `207` handling, the
 * authed-first public fallback, and every app's `SUPPORTED_LANGUAGES`. Each had
 * exactly one consumer, so each stays with it — see `constants.ts` and the
 * per-module provenance notes for the list.
 */

export { Badge, badgeBaseClass, badgeClass, badgeVariantClass } from './Badge.tsx';
export type { BadgeProps, BadgeVariant } from './Badge.tsx';

export { Button, buttonBaseClass, buttonClass, buttonSizeClass, buttonVariantClass } from './Button.tsx';
export type { ButtonProps, ButtonSize, ButtonVariant } from './Button.tsx';

export { Card, cardClass, cardHeaderClass, cardTitleClass, CardHeader, CardTitle } from './Card.tsx';
export type { CardHeaderProps, CardProps, CardTitleProps } from './Card.tsx';

export { FocusInput } from './FocusInput.tsx';
export type { FocusInputProps } from './FocusInput.tsx';

export { Input, Label, Select, Textarea, fieldClass } from './Input.tsx';
export type { InputProps, LabelProps, SelectProps, TextareaProps } from './Input.tsx';

export { LoadingButton } from './LoadingButton.tsx';
export type { LoadingButtonProps } from './LoadingButton.tsx';

// Converged from the `ModalShell` / `ConfirmDeleteModal` / `PageState` copies
// that Durable-DAV, Durable-DAV-Router, Mail-Otter and Edge-Git each shipped.
// Deliberately dependency-free — labels are props, not `useTranslation` — so
// adopting these does not require a translation library or an icon set.
export { ModalShell } from './ModalShell.tsx';
export type { ModalShellProps } from './ModalShell.tsx';
export { ConfirmDeleteModal, EmptyState, LoadingSpinner } from './PageState.tsx';

// The second convergence round: page layout, the notice banner, the access
// page, the language picker, and the two clipboard-bearing controls. Same rule
// on labels — the app owns its string catalogue. Three of these need
// `lucide-react`, which is why it is a peer and not a dependency.
export { AppPage } from './AppPage.tsx';
export type { AppPageProps, AppPageVariant } from './AppPage.tsx';
export { PageHeaderCard } from './PageHeaderCard.tsx';
export type { PageHeaderCardProps } from './PageHeaderCard.tsx';
export { ContextBar } from './ContextBar.tsx';
export type { ContextBarProps } from './ContextBar.tsx';
export { Unauthorized } from './Unauthorized.tsx';
export type { UnauthorizedProps } from './Unauthorized.tsx';
export { NoticeBar } from './NoticeBar.tsx';
export type { NoticeBarProps, NoticeStatusLabels } from './NoticeBar.tsx';
export { LanguageSelector } from './LanguageSelector.tsx';
export type { LanguageSelectorProps } from './LanguageSelector.tsx';
export { RefreshButton } from './RefreshButton.tsx';
export type { RefreshButtonProps } from './RefreshButton.tsx';
export { ReadOnlyField } from './ReadOnlyField.tsx';
export type { ReadOnlyFieldProps } from './ReadOnlyField.tsx';
export { TypeToConfirmModal } from './TypeToConfirmModal.tsx';
export type { TypeToConfirmModalProps } from './TypeToConfirmModal.tsx';
export { useCopyToClipboard } from './useCopyToClipboard.ts';
export type { UseCopyToClipboardResult } from './useCopyToClipboard.ts';

export { Pagination, clampPage, pageCountFor, pageWindow } from './Pagination.tsx';
export type { PaginationLabels, PaginationProps } from './Pagination.tsx';

export { Spinner } from './Spinner.tsx';
export type { SpinnerProps } from './Spinner.tsx';

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
} from './theme.ts';

export { cn } from './utils.ts';
export type { ClassDictionary, ClassValue } from './utils.ts';

export { COPY_FEEDBACK_TIMEOUT_MS, NOTICE_TIMEOUT_MS, ZERO_TRUST_AUTHENTICATION_PATH } from './constants.ts';

export { useNotice } from './useNotice.ts';
export type { Notice, NoticeKind, ShowNotice, UseNoticeOptions, UseNoticeResult } from './useNotice.ts';

export {
  canonicalizeLanguageTag,
  DEFAULT_FALLBACK_LANGUAGE,
  DEFAULT_LANGUAGE_STORAGE_KEY,
  DEFAULT_SUPPORTED_LANGUAGES,
  resolveLanguageTag,
  useSpaLanguage,
} from './useSpaLanguage.ts';
export type { LanguageTag, UseSpaLanguageOptions, UseSpaLanguageResult } from './useSpaLanguage.ts';

export { CURRENT_USER_PATH, useCurrentUser } from './useCurrentUser.ts';
export type { CurrentUser, UseCurrentUserOptions, UseCurrentUserResult } from './useCurrentUser.ts';

export { buildQuery, createApiClient, HttpStatusError, MAX_ERROR_MESSAGE_LENGTH } from './api.ts';
export type { ApiClient, ApiRequestInit, CreateApiClientOptions, FetchFn, QueryParams, QueryValue } from './api.ts';
