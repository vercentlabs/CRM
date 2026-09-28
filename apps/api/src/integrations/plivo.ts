import plivo from 'plivo';

/**
 * Plivo adapter. The CRM calls module depends on the `Telephony` interface,
 * not on Plivo payloads; webhook signature verification lives in
 * platform/plivo-signature.ts.
 */

export interface DialRequest {
  from: string | undefined;
  to: string;
  answerUrl: string;
  metadata: Record<string, unknown>;
}

export interface Telephony {
  dial(request: DialRequest): Promise<{ callUuid: string }>;
  /** Plivo XML that bridges an answered call to `targetNumber` and records it. */
  bridgeXml(targetNumber: string, recordActionUrl: string): string;
}

// The SDK client is constructed at import time (it validates credentials eagerly).
const client = new plivo.Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN);

interface PlivoCallResponse {
  messageUuid?: string;
  callUuid?: string;
  requestUuid?: string;
}

export const plivoTelephony: Telephony = {
  async dial({ from, to, answerUrl, metadata }) {
    const response = (await client.calls.create(from ?? '', to, answerUrl, {
      answerMethod: 'POST',
      callerId: from,
      ...metadata,
    })) as unknown as PlivoCallResponse;
    const callUuid = response.messageUuid ?? response.callUuid ?? response.requestUuid;
    if (!callUuid) throw new Error('Plivo did not return a call id');
    return { callUuid: String(callUuid) };
  },

  bridgeXml(targetNumber, recordActionUrl) {
    const response = new (plivo as unknown as { Response: new () => PlivoXml }).Response();
    const dial = response.addDial({
      callerId: process.env.PLIVO_PHONE_NUMBER,
      record: 'true',
      action: recordActionUrl,
      method: 'POST',
    });
    dial.addNumber(targetNumber);
    return response.toXML();
  },
};

/** The subset of the SDK's XML builder used here (the SDK types omit its constructor). */
interface PlivoXml {
  addDial(options: Record<string, unknown>): { addNumber(number: string): void };
  toXML(): string;
}
