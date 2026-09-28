# Architecture Guardrails

These rules are permanent. A PR that breaks one needs an explicit, documented exception.

1. **Every business record is tenant-scoped.** New tables get `organization_id`, and every query filters by it. (Enforced from Phase 2; design for it now.)
2. **The server performs authorization.** Every route declares its auth and permission requirement, and record scope is applied in the data layer.
3. **Frontend visibility is not security.** Hiding a button or menu entry never replaces a server check.
4. **No new SQL in controllers or routes.** SQL lives in repositories and `packages/database`, and it is always parameterized (`$1`), never string-interpolated.
5. **Business rules live in services,** not in controllers, React components or screens.
6. **Clients use versioned contracts.** New endpoints go under `/api/v1` and return the standard envelopes. Request and response shapes come from `@crm/types` and `@crm/validation`.
7. **Destructive migrations require explicit human review.** Migrations are forward-only, and applied files are never edited. Destructive SQL needs `-- crm:allow-destructive` plus reviewer sign-off.
8. **Secrets never enter source control.** Configuration comes from env vars validated at startup. Only `.env.example` files are committed.
9. **Web and mobile share API contracts** (`@crm/types`, `@crm/validation`, `@crm/api-client`) instead of redefining them.
10. **No premature microservices.** The system stays one API, one worker and one Postgres. Kafka, Kubernetes and Elasticsearch need an ADR showing a measured need.

Layer boundaries:

- **web:** presentation, interaction, browser behaviour.
- **mobile:** native UI, navigation, device storage and integrations.
- **api:** orchestration, authorization, validation.
- **database:** persistence.
- **packages:** reusable contracts and infrastructure abstractions.

The following must not happen: DB access from web or mobile, mobile-specific logic in the API, DB row types exported to clients, or duplicated request schemas where a shared one is practical.
