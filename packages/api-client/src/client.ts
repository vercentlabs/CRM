import {
  API_V1_PREFIX,
  REQUEST_ID_HEADER,
  type ApiMeta,
  type ApiSuccess,
  type HealthLiveData,
  type HealthReadyData,
} from '@crm/types';
import { ApiClientError, errorFromResponse } from './errors.js';
import { createResources, type CrmResources } from './resources.js';

type MaybePromise<T> = T | Promise<T>;

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type QueryValue = string | number | boolean | null | undefined;

export interface ApiClientOptions {
  /** API origin, e.g. `https://api.example.com`. May be resolved lazily (mobile stores an override). */
  baseUrl: string | (() => MaybePromise<string>);
  /** Bearer mode (mobile/API): returns the access token, if any. */
  getToken?: () => MaybePromise<string | null | undefined>;
  /**
   * Cookie mode (web): send the HttpOnly session cookies with every request
   * (`'include'` for a separate API origin).
   */
  credentials?: RequestCredentials;
  /** Cookie mode: CSRF token from the session payload, sent as `x-csrf-token` on unsafe methods. */
  getCsrfToken?: () => MaybePromise<string | null | undefined>;
  /** Called once per 401 response, before the error is thrown. */
  onUnauthorized?: (error: ApiClientError) => void;
  /** Defaults to 10s, matching the existing web and mobile clients. */
  timeoutMs?: number;
  /** Override for tests or non-standard runtimes. */
  fetch?: typeof fetch;
  /** Generates the `x-request-id` sent with each request. */
  generateRequestId?: () => string;
  defaultHeaders?: Record<string, string>;
}

export interface RequestOptions {
  query?: Record<string, QueryValue | QueryValue[]>;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Skip the Authorization header (e.g. login, health). */
  anonymous?: boolean;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const CSRF_HEADER = 'x-csrf-token';
const UNSAFE_METHODS: ReadonlySet<HttpMethod> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** A v1 success envelope with its data and optional meta (pagination). */
export interface V1Result<T> {
  data: T;
  meta?: ApiMeta;
}

/** Transport for `/api/v1` routes: unwraps the success envelope. */
export interface V1Transport {
  request<T>(method: HttpMethod, path: string, options?: RequestOptions): Promise<V1Result<T>>;
}

export function defaultRequestId(): string {
  const cryptoRef = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoRef?.randomUUID) return cryptoRef.randomUUID();
  // React Native (Hermes) lacks crypto.randomUUID; ids only need to be unique enough to correlate logs.
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 14)}`;
}

export function buildUrl(baseUrl: string, path: string, query?: RequestOptions['query']): string {
  const base = baseUrl.replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (item !== undefined && item !== null) params.append(key, String(item));
    }
  }
  const search = params.toString();
  return `${base}${suffix}${search ? `?${search}` : ''}`;
}

function isBodyInit(body: unknown): body is BodyInit {
  return (
    typeof body === 'string' ||
    (typeof FormData !== 'undefined' && body instanceof FormData) ||
    (typeof Blob !== 'undefined' && body instanceof Blob) ||
    (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) ||
    body instanceof ArrayBuffer
  );
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const contentType = response.headers.get('content-type') ?? '';
  const text = await response.text();
  if (!text) return undefined;
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

export interface ApiClient {
  request<T = unknown>(method: HttpMethod, path: string, options?: RequestOptions): Promise<T>;
  get<T = unknown>(path: string, options?: Omit<RequestOptions, 'body'>): Promise<T>;
  post<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  put<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  patch<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  delete<T = unknown>(path: string, options?: RequestOptions): Promise<T>;
  /** Helpers for `/api/v1` routes; they unwrap the `data` field of the success envelope. */
  v1: V1Transport &
    CrmResources & {
      get<T>(path: string, options?: Omit<RequestOptions, 'body'>): Promise<T>;
      health: {
        live(): Promise<HealthLiveData>;
        ready(): Promise<HealthReadyData>;
      };
    };
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const generateRequestId = options.generateRequestId ?? defaultRequestId;

  const resolveBaseUrl = async () =>
    typeof options.baseUrl === 'function' ? options.baseUrl() : options.baseUrl;

  async function request<T>(
    method: HttpMethod,
    path: string,
    init: RequestOptions = {},
  ): Promise<T> {
    const requestId = generateRequestId();
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...options.defaultHeaders,
      ...init.headers,
      [REQUEST_ID_HEADER]: requestId,
    };

    if (!init.anonymous && options.getToken) {
      const token = await options.getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    if (UNSAFE_METHODS.has(method) && options.getCsrfToken) {
      const csrf = await options.getCsrfToken();
      if (csrf) headers[CSRF_HEADER] = csrf;
    }

    let body: BodyInit | undefined;
    if (init.body !== undefined) {
      if (isBodyInit(init.body)) {
        body = init.body;
      } else {
        body = JSON.stringify(init.body);
        headers['Content-Type'] ??= 'application/json';
      }
    }

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(
      () => {
        timedOut = true;
        controller.abort();
      },
      init.timeoutMs ?? options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    const onAbort = () => controller.abort();
    init.signal?.addEventListener('abort', onAbort, { once: true });

    let response: Response;
    let parsed: unknown;
    try {
      const url = buildUrl(await resolveBaseUrl(), path, init.query);
      response = await fetchImpl(url, {
        method,
        headers,
        body,
        signal: controller.signal,
        ...(options.credentials ? { credentials: options.credentials } : {}),
      });
      parsed = await parseBody(response);
    } catch (cause) {
      const code = timedOut ? 'TIMEOUT' : init.signal?.aborted ? 'ABORTED' : 'NETWORK_ERROR';
      const message =
        code === 'TIMEOUT'
          ? 'Request timed out'
          : code === 'ABORTED'
            ? 'Request was cancelled'
            : 'Unable to reach the server';
      throw new ApiClientError({ message, status: 0, code, requestId, cause });
    } finally {
      clearTimeout(timer);
      init.signal?.removeEventListener('abort', onAbort);
    }

    if (!response.ok) {
      const error = errorFromResponse(
        response.status,
        parsed,
        response.headers.get(REQUEST_ID_HEADER) ?? requestId,
      );
      if (error.isUnauthenticated) options.onUnauthorized?.(error);
      throw error;
    }
    return parsed as T;
  }

  const transport: V1Transport = {
    async request<T>(method: HttpMethod, path: string, init?: RequestOptions) {
      const envelope = await request<ApiSuccess<T>>(method, `${API_V1_PREFIX}${path}`, init);
      return envelope.meta ? { data: envelope.data, meta: envelope.meta } : { data: envelope.data };
    },
  };

  async function v1Get<T>(path: string, init?: Omit<RequestOptions, 'body'>): Promise<T> {
    return (await transport.request<T>('GET', path, init)).data;
  }

  return {
    request,
    get: (path, init) => request('GET', path, init),
    post: (path, body, init) => request('POST', path, { ...init, body }),
    put: (path, body, init) => request('PUT', path, { ...init, body }),
    patch: (path, body, init) => request('PATCH', path, { ...init, body }),
    delete: (path, init) => request('DELETE', path, init),
    v1: {
      ...transport,
      ...createResources(transport),
      get: v1Get,
      health: {
        live: () => v1Get<HealthLiveData>('/health/live', { anonymous: true }),
        ready: () => v1Get<HealthReadyData>('/health/ready', { anonymous: true }),
      },
    },
  };
}
