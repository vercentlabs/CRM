export type AuthUser = {
  id: number;
  email: string;
  /** DEPRECATED legacy role id (1/2/3), used only for existing role-based navigation. */
  roleId: number;
  name: string;
  organization?: { id: string; name: string; slug: string };
  role?: { key: string; name: string };
  /** permission → record scope; UI hints only, the API enforces them. */
  permissions?: Record<string, string>;
};
