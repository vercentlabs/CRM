import { getRefreshToken, getToken, setSessionTokens } from './authStorage';
import { getApiBaseUrl } from './apiBase';

export type ApiEnvelope<T> = {
  success: boolean;
  message?: string;
  data?: T;
  errors?: unknown;
  error?: unknown;
};

export type ApiError = {
  status: number;
  message: string;
  payload?: unknown;
};

type RequestOptions = Omit<RequestInit, 'body' | 'headers'> & {
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Internal: do not attempt a token refresh on 401 (auth endpoints, retries). */
  skipAuthRefresh?: boolean;
};

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

export const setUnauthorizedHandler = (handler: UnauthorizedHandler | null) => {
  unauthorizedHandler = handler;
};

const isFormData = (body: unknown): body is FormData => {
  return typeof FormData !== 'undefined' && body instanceof FormData;
};

const isJsonBody = (body: unknown) => {
  return (
    body !== null &&
    typeof body === 'object' &&
    !isFormData(body) &&
    !(body instanceof ArrayBuffer)
  );
};

const parseResponseBody = async (response: Response) => {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
};

const errorMessage = (payload: unknown) => {
  if (payload && typeof payload === 'object') {
    const error = (payload as { error?: unknown }).error;
    if (error && typeof error === 'object' && 'message' in error) {
      return String((error as { message?: string }).message);
    }
    if ('message' in payload) return String((payload as { message?: string }).message);
  }
  return 'Request failed';
};

type AuthTokens = { accessToken: string; refreshToken: string };

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Exchanges the SecureStore refresh token for a new pair (rotation).
 * Concurrent 401s share one refresh; a rejected refresh means the session is over.
 */
export const refreshSession = (): Promise<boolean> => {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const baseUrl = await getApiBaseUrl();
      const refreshToken = await getRefreshToken(baseUrl);
      if (!refreshToken) return false;
      try {
        const tokens = await apiRequest<AuthTokens>('/api/v1/auth/refresh', {
          method: 'POST',
          body: { refreshToken },
          skipAuthRefresh: true
        });
        if (!tokens?.accessToken) return false;
        await setSessionTokens(tokens, baseUrl);
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
};

const sendOnce = async <T>(path: string, options: RequestOptions, apiBaseUrl: string): Promise<{ response: Response; payload: unknown }> => {
  const { timeoutMs = 10000, headers, body, signal, skipAuthRefresh: _skip, ...rest } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const token = await getToken(apiBaseUrl);
    const requestHeaders: Record<string, string> = {
      Accept: 'application/json',
      ...(headers || {})
    };

    if (token) {
      requestHeaders.Authorization = `Bearer ${token}`;
    }

    let requestBody: BodyInit | undefined;
    if (body !== undefined) {
      if (isJsonBody(body)) {
        if (!requestHeaders['Content-Type']) {
          requestHeaders['Content-Type'] = 'application/json';
        }
        requestBody = JSON.stringify(body);
      } else {
        requestBody = body as BodyInit;
      }
    }

    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...rest,
      headers: requestHeaders,
      body: requestBody,
      signal: signal ?? controller.signal
    });

    return { response, payload: await parseResponseBody(response) };
  } finally {
    clearTimeout(timeoutId);
  }
};

export const apiRequest = async <T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> => {
  const apiBaseUrl = await getApiBaseUrl();

  try {
    let { response, payload } = await sendOnce<T>(path, options, apiBaseUrl);

    // Access tokens are short-lived: refresh once and retry before giving up.
    if (response.status === 401 && !options.skipAuthRefresh) {
      if (await refreshSession()) {
        ({ response, payload } = await sendOnce<T>(path, { ...options, skipAuthRefresh: true }, apiBaseUrl));
      }
    }

    if (!response.ok) {
      if (response.status === 401 && unauthorizedHandler && !path.startsWith('/api/v1/auth/')) {
        unauthorizedHandler();
      }

      throw {
        status: response.status,
        message: errorMessage(payload),
        payload
      } as ApiError;
    }

    if (payload && typeof payload === 'object' && 'data' in payload) {
      return (payload as ApiEnvelope<T>).data as T;
    }

    return payload as T;
  } catch (error) {
    if (error && typeof error === 'object' && 'name' in error) {
      const name = String((error as { name?: string }).name);
      if (name === 'AbortError') {
        throw {
          status: 0,
          message: `Request timed out. Unable to reach ${apiBaseUrl}.`,
          payload: { baseUrl: apiBaseUrl }
        } as ApiError;
      }
    }

    if (error && typeof error === 'object' && 'message' in error) {
      const message = String((error as { message?: string }).message || '');
      if (message.toLowerCase().includes('network request failed')) {
        throw {
          status: 0,
          message: `Network request failed. Unable to reach ${apiBaseUrl}.`,
          payload: { baseUrl: apiBaseUrl }
        } as ApiError;
      }
    }

    throw error;
  }
};
