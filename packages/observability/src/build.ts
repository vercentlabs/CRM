/**
 * Release identity, injected at image build time (APP_VERSION, GIT_SHA,
 * BUILD_TIME build args → env). Nothing to edit per release; unknown values
 * fall back to "dev". Safe to expose: no secrets, no hostnames.
 */
export interface BuildInfo {
  version: string;
  commit: string;
  builtAt: string | null;
}

export function buildInfo(env: Record<string, string | undefined> = process.env): BuildInfo {
  const commit = (env.GIT_SHA ?? '').trim();
  return {
    version: (env.APP_VERSION ?? '').trim() || '0.0.0-dev',
    commit: /^[0-9a-f]{7,40}$/i.test(commit) ? commit.slice(0, 12) : 'dev',
    builtAt: env.BUILD_TIME && !Number.isNaN(Date.parse(env.BUILD_TIME)) ? env.BUILD_TIME : null,
  };
}
