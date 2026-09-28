/** User summary returned by `POST /auth/login` (legacy) and future `/api/v1/auth` routes. */
export interface AuthUser {
  id: number;
  email: string;
  roleId: number;
  name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponseData {
  token: string;
  user: AuthUser;
}
