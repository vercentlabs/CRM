import { getToken } from './authStorage';
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

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  timeoutMs?: number;
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

export const apiRequest = async <T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> => {
  const { timeoutMs = 10000, headers, body, signal, ...rest } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const apiBaseUrl = await getApiBaseUrl();

  try {
    const token = await getToken();
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

    const payload = await parseResponseBody(response);

    if (!response.ok) {
      if (response.status === 401 && unauthorizedHandler) {
        unauthorizedHandler();
      }

      const message =
        payload && typeof payload === 'object' && 'message' in payload
          ? String((payload as { message?: string }).message)
          : 'Request failed';

      throw {
        status: response.status,
        message,
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
  } finally {
    clearTimeout(timeoutId);
  }
};
