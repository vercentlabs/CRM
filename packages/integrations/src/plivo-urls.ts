/**
 * Plivo callback URLs derived from PLIVO_WEBHOOK_URL (the public URL of the
 * API's `/api/plivo/webhook` mount). One definition for the API (calls), the
 * worker (SMS delivery reports) and the `plivo:check` diagnostic, so the URLs
 * Plivo calls always match the URLs whose signatures are verified.
 */
export interface PlivoCallbackUrls {
  /** Call answered: returns the bridge XML (answer_url). */
  answer: string;
  /** Recording ready (the Dial action URL in the answer XML). */
  recording: string;
  /** Call ended / status changes (hangup_url). */
  status: string;
  /** SMS delivery reports (message `url`). */
  messageStatus: string;
}

export interface PlivoUrlCheck {
  ok: boolean;
  problems: string[];
  urls?: PlivoCallbackUrls;
}

export function plivoCallbackUrls(webhookBase: string): PlivoCallbackUrls {
  const base = webhookBase.replace(/\/+$/, '');
  return {
    answer: `${base}/answer`,
    recording: `${base}/recording`,
    status: `${base}/status`,
    messageStatus: `${base}/message-status`,
  };
}

/** Validates PLIVO_WEBHOOK_URL without contacting anything (diagnostics and startup checks). */
export function checkPlivoWebhookUrl(
  value: string | undefined,
  options: { production: boolean },
): PlivoUrlCheck {
  const problems: string[] = [];
  if (!value) return { ok: false, problems: ['PLIVO_WEBHOOK_URL is not set'] };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, problems: ['PLIVO_WEBHOOK_URL is not an absolute URL'] };
  }
  if (!/\/webhook\/?$/.test(url.pathname))
    problems.push('The path must end with /webhook (…/api/plivo/webhook)');
  if (url.search || url.hash) problems.push('The URL must not contain a query string or fragment');
  if (url.username || url.password) problems.push('The URL must not contain credentials');
  if (options.production && url.protocol !== 'https:')
    problems.push('Production requires https://');
  const host = url.hostname;
  if (
    options.production &&
    (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
      host.endsWith('.local'))
  ) {
    problems.push('The host is not publicly reachable by Plivo');
  }
  return problems.length
    ? { ok: false, problems }
    : { ok: true, problems, urls: plivoCallbackUrls(value) };
}
