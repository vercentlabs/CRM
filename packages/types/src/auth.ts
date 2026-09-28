/** User summary. Roles and permissions come from the active membership, never from the user. */
export interface AuthUser {
  id: number;
  email: string;
  name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  /** Public organization id to sign in to; defaults to the first active membership. */
  organizationId?: string;
  /** 'web' receives HttpOnly cookies; 'mobile' receives tokens in the body. Default 'web'. */
  client?: 'web' | 'mobile';
}

export interface OrganizationSummary {
  /** Stable public UUID; internal numeric ids are never exposed for organizations. */
  id: string;
  name: string;
  slug: string;
}

export interface RoleSummary {
  key: string;
  name: string;
}

export interface MembershipSummary {
  organization: OrganizationSummary;
  role: RoleSummary;
  status: 'active' | 'invited' | 'suspended';
}

export type RecordScopeName = 'own' | 'organization';

/** `/api/v1/auth/*` session payload. */
export interface AuthSessionView {
  user: AuthUser;
  organization: OrganizationSummary;
  membership: { id: number; role: RoleSummary };
  /** permission → record scope granted by the active membership. */
  permissions: Record<string, RecordScopeName>;
  /** Organizations the user may switch to (active) or accept (invited). */
  organizations: MembershipSummary[];
  accessTokenExpiresAt: string;
  sessionExpiresAt: string;
  /** Cookie clients only: send back as `x-csrf-token` on unsafe requests. */
  csrfToken?: string;
  /** Mobile/API clients only. */
  accessToken?: string;
  refreshToken?: string;
}
