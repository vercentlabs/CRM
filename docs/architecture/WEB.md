# Web app (Phase 4)

`apps/web` is a Next.js 16 App Router app in strict TypeScript. It talks to the API only through `@crm/api-client` (`/api/v1`), and it holds no business rules: the API authorizes every request and applies tenancy, scopes and validation.

## Layout

```
src/
  app/                 routes only: (auth)/login|forgot-password|reset-password, (app)/<page>/page.tsx
                       (server components: metadata + permission gate + the module's screen)
  modules/<domain>/    screens, hooks (queries/mutations), forms and dialogs of one domain:
                       leads, customers, opportunities, tasks (+ calendar), followups, notes, calls,
                       messages, chat, reports, dashboard, locations, settings, organization, auth
  components/          shared, domain-free: auth (AuthGate, PermissionGate), navigation (AppShell,
                       Topbar, CommandPalette, navigation config), data-table, forms, feedback, charts
  providers/           AppProviders → QueryClient, Theme, Toasts, SessionProvider
  hooks/               useListParams (URL list state), useDebouncedValue
  lib/                 api (the one API client), csrf, query, permissions, errors, format, labels
packages/ui/           @crm/ui design system (tokens + primitives)
```

## Rules

- **One API integration.** `lib/api.ts` creates the client in cookie mode (`credentials: 'include'`, CSRF header on unsafe methods, request ids, one shared refresh on 401). UI code calls `api().v1.<resource>`; it never builds URLs, uses `fetch`/axios, or parses envelopes. `test/architecture.test.ts` enforces this, and also blocks `roleId`, token storage, and HTML injection.
- **Server state** lives in TanStack Query. Keys always start with `['org', <organization public id>]` (`useQueryKey()`), mutations invalidate their domain prefix, and queries do not retry 4xx errors. Redux was removed.
- **Auth/session** (`SessionProvider`): the session view comes from `GET /auth/session`. That includes user, organization, membership, permissions and the list of organizations. Tokens stay in HttpOnly cookies, and the CSRF token is held in memory only. The states are `loading`, `authenticated`, `unauthenticated`, `no-access` (suspended or removed membership) and `error`. An expired session redirects to `/login?reason=expired&next=…`.
- **Route protection** happens once, in `app/(app)/layout.tsx` (`AuthGate`). Protected content never renders before the session is known. Pages wrap their screen in `RequirePermission`, which shows a permission-denied panel.
- **Organization switching** calls `POST /auth/switch-organization`, cancels in-flight queries, clears the whole query cache, applies the new session and navigates to the dashboard. The org-scoped keys mean even a stale observer cannot read another tenant's cache.
- **Permissions** (`lib/permissions.ts`): `can`, `canAny`, `canOrg` (organization-wide scope) and `scopeOf` read the session's permission map. Navigation (`components/navigation/navigation.ts`) and actions are filtered with them. These checks are for the UI only; a hidden button is never the security. Some "can I edit this row?" hints mirror the API's ownership rules (assigned to me, or unassigned and created by me). If they are ever wrong, the API still refuses and the UI shows its error.
- **Forms** use React Hook Form with the shared `@crm/validation` schemas (`useZodForm`), so browser and API validate identically. `applyServerErrors` maps API `details` (for example `body.email`) onto fields. Sheets mount their form only while open, so each opening starts fresh, and the submit button is disabled while saving. `datetime-local` values are sent as ISO instants (`toIsoOrNull`).
- **Lists** use `DataTable` (server sort via allowlisted fields, pagination, skeleton, empty and error states, horizontal scroll on small screens). Search, filters, sort and page live in the URL (`useListParams`).
- **Errors**: `ApiErrorState` distinguishes 403 (permission denied) from 404 (not found, which also covers other organizations' records) from everything else. Other errors show a retry and the request id. 5xx messages are never shown verbatim.
- **Dates** are shown in the viewer's locale and time zone (`lib/format.ts`). The organization's `timezone` setting is not applied yet, because only administrators can read settings.

## Design system (`@crm/ui`)

- Tokens live in `packages/ui/theme.css` (CSS variables plus Tailwind `@theme`), in light and dark, and meet WCAG AA contrast. `cn()` merges classes so callers can override defaults (`w-full` → `w-40`).
- Primitives: Button, IconButton, Input, Textarea, Select, Checkbox, Field (label, hint, error and ARIA wiring), FormGrid, Badge, Avatar, Card, DescriptionList, Stat, Tabs, Dialog, Sheet and ConfirmDialog (native `<dialog>`, focus return), DropdownMenu (WAI-ARIA menu), Combobox, Table primitives, Pagination, Skeleton, PageSkeleton, EmptyState, ErrorState, PermissionDenied, Alert, Toasts and icons.
- Charts (`components/charts`) are single-series bar and column charts with a table view. No chart library is used.

## Testing

- `pnpm --filter @crm/web test` runs Vitest and Testing Library in jsdom. The scripted API (`test/harness.tsx`) fails on any unmocked endpoint. It covers session restore, refresh, redirect, logout, organization-switch cache isolation, permissions, leads/customers/opportunities workflows, forms, the data table, errors, axe checks and architecture rules.
- `pnpm --filter @crm/web test:e2e` runs Playwright against the built API and a disposable database (`E2E_DATABASE_URL`). It covers login, dashboard with axe, lead create/edit/assign, opportunity, Sales restrictions, organization switch and logout.

## Known gaps

- Chat polls (5 s for an open thread, 15 s for the list); there is no push channel yet.
- Starting a chat requires `settings.users.read` (member directory). Sales users can reply but not start conversations; this was already true before Phase 4.
- Follow-ups are the lead call schedule. Completing one updates the lead (status, next call cleared), because schedule items carry no follow-up id.
- Removed or never-working UI: CSV exports of calls, customers and opportunities (no API existed), the "map view coming soon" placeholder, the `/search`, `/profile` and `/change-password` links (replaced by quick navigation and `/account`), and the fake SMTP-provider settings form.
