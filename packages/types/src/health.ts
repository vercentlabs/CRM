export type HealthStatus = 'ok' | 'degraded' | 'unavailable';

export interface HealthLiveData {
  status: 'ok';
  uptimeSeconds: number;
  timestamp: string;
}

export interface HealthCheckResult {
  status: 'ok' | 'unavailable';
  latencyMs?: number;
}

export interface HealthReadyData {
  status: HealthStatus;
  timestamp: string;
  checks: Record<string, HealthCheckResult>;
}
