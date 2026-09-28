# Mobile app (Phase 5)

`apps/mobile` is an Expo SDK 54 / React Native 0.81 app in strict TypeScript. It talks to the API only through `@crm/api-client` in bearer mode (`/api/v1`), and it holds no business rules: the API authorizes every request and applies tenancy, scopes and validation.

## Layout

```
App.tsx                 AppProviders + NavigationContainer (themed) + RootNavigator
src/
  lib/                  api (the one API client), tokens (memory + SecureStore), config (base URL),
                        query (QueryClient defaults), errors (ApiClientError → display), format, labels
  providers/            AppProviders → SafeArea, QueryClient, Theme, Toasts, SessionProvider
  navigation/           RootNavigator (auth states), AppDrawer (permission-filtered), menu, types
  modules/<domain>/     screens, hooks (queries/mutations), forms and sheets of one domain:
                        auth, dashboard, leads, customers, opportunities, tasks (+ calendar), followups,
                        notes, calls, messages, chat, reports, locations, organization (members),
                        settings (+ audit), account
  components/ui/        native primitives: Text, Button/IconButton, Badge/Avatar, Chip, fields (text,
                        select, date-time, switch, segmented), Screen/Card/Section/Detail, Sheet,
                        Loading/Empty/Error/PermissionDenied states, Toasts + confirm
  components/lists/     PagedList (infinite v1 pagination, pull-to-refresh) and ListRow
  components/forms/     useZodForm + Form* controllers, member/lead pickers, FormActions/FormError
  theme/                light/dark tokens aligned with the web design tokens; theme preference
test/                   jest-expo + React Native Testing Library suites and helpers (fake /api/v1 server)
```

## Rules

- **One API integration.** `lib/api.ts` creates the client with `getToken` (memory access token) and `refreshSession`. Screens call `api().v1.<resource>`; they never build URLs, use `fetch`/axios, or parse envelopes. `test/architecture.test.ts` enforces this and also blocks legacy endpoints, `roleId`/`role_id`, `/ai/*`, `/integrations/google/*`, hand-built query keys and token persistence.
- **Tokens** (`lib/tokens.ts`): the access token lives in memory only; the refresh token lives only in Expo SecureStore, keyed per API origin. Neither reaches AsyncStorage, React state or screens. AsyncStorage holds only the theme preference.
- **Refresh**: on a 401 the client runs one shared refresh (single-flight across concurrent requests), stores the rotated pair, then retries once. A rejected refresh (401/403: revoked, reused or expired) clears the tokens and signs out with an "expired" notice; a network failure keeps the refresh token so being offline never signs the user out.
- **Session** (`SessionProvider`): `status` is `starting` → `signed-out` | `signed-in` | `no-access` (suspended membership) | `error` (server unreachable; retry keeps the token). It exposes `user`, `organization`, `membership`, `organizations`, `permissions`, `can`, `canAny`, `canOrg`, `scopeOf`, `login`, `logout`, `switchOrganization`. Protected screens are not registered until the session is restored, so nothing flashes.
- **Organization switching** (drawer or My account) calls `POST /auth/switch-organization`, cancels in-flight queries, clears the whole query cache, stores the new tokens and resets navigation to Home. The signed-in stack is keyed by organization id (`Stack.Group navigationKey`), and query keys always start with `['org', <organization public id>]` (`useQueryKey()`).
- **Permissions** (`@crm/permissions` `canIn`/`canAnyIn`/`canOrgIn`/`scopeIn`): the drawer (`navigation/menu.ts`, groups Work / CRM / Communication / Insights / Organization) and every action are filtered from the session's permissions; unreachable destinations are not even registered. There is no numeric-role logic (MOBILE_ROLEID_DEPENDENCY = NONE). Checks are UX only; the API still refuses and the app shows its error.
- **Server state** lives in TanStack Query: 30 s stale time, retries only for network/5xx, no mutation retries, and mutations invalidate their domain prefix. Lists use v1 pagination metadata (`PagedList`: infinite scroll, pull-to-refresh, load-more errors). Search is debounced (350 ms) and sent to the server.
- **Forms** use React Hook Form with the shared `@crm/validation` schemas (`useZodForm`), so device and API validate identically. `applyServerErrors` maps API `details` onto fields; the form keeps what was typed on failures. Submit buttons show progress and block double submits.
- **Errors** (`lib/errors.ts`): one mapping for offline/timeout, 401, 403 (permission panel), 404 (not found, which also covers other organizations' records), 409, validation, 503 and 5xx (never shown verbatim; the request id is shown as a reference).
- **Chat** polls (list 15 s, open thread 5 s); there is no realtime channel. Presence is set online when chat opens and offline on sign-out; the API already returns the correct `is_online`. Attachments are picked with `expo-document-picker` and uploaded through `files.uploadChatAttachment` (10 MB, server-validated types). Only `http(s)` attachment links open.
- **Calls** start from a lead (`POST /calls`); telephony runs server-side (no Plivo in the app). The call sheet shows starting → active (timer) → ended/failed and records the outcome with `POST /calls/:id/end`.
- **Follow-ups** are the lead call schedule; "overdue" is derived from the date. Completing one records the lead status and clears the next call; there is no "mark overdue".
- **Locations**: check-in is manual (coordinates and address). Device GPS capture needs `expo-location` and a new native build (not added).
- **Dates** are shown in the device locale and time zone (`lib/format.ts`); the organization `timezone` setting is not applied yet (Phase 7 item, same as web).

## Removed in Phase 5

The legacy screens and services (the `fetch` wrapper `services/api.ts` with its legacy endpoints, `AuthContext`, base-URL override stored in AsyncStorage, cached user profile, `roleId` menus, the AI assistant calling non-existent `/ai/*`, the Google Calendar connection calling non-existent `/integrations/google/*`, placeholder/"coming soon" screens, map placeholder, CSV exports that had no API) and unused dependencies (NativeWind/Tailwind, `react-native-css-interop`, `expo-linear-gradient`, bottom tabs, masked view, `react-native-svg`).

## Running and testing

- `pnpm dev:mobile` (builds the workspace packages, then `expo start`). Set `EXPO_PUBLIC_API_BASE_URL` (for example `http://192.168.1.10:5000`); in development it falls back to the Metro host on port 5000 (`10.0.2.2` on the Android emulator).
- `pnpm --filter @crm/mobile test` (jest-expo + RNTL): session restore/login/refresh/revocation/logout, SecureStore vs memory tokens, organization switching and cache isolation, permission-driven navigation, leads (list, pagination, search, create, server validation, gating), customers/opportunities/tasks, admin controls, error mapping and the architecture test.
- `pnpm --filter @crm/mobile lint` and `typecheck`. `npx expo export --platform android` checks that Metro can bundle the app.
- `expo-secure-store` and `expo-document-picker` are native modules: installed builds need a new EAS build. Native end-to-end tests (Detox/Maestro) are not set up.
