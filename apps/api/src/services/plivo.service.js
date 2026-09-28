import plivo from 'plivo';

/**
 * Plivo Service - Handles all Plivo-related operations
 * This service provides methods to make calls, handle webhooks, and manage Plivo resources
 */

// Initialize Plivo client with environment variables
const plivoClient = new plivo.Client(
  process.env.PLIVO_AUTH_ID,
  process.env.PLIVO_AUTH_TOKEN
);

/**
 * Make an outbound call using Plivo
 * @param {string} from - Plivo phone number to call from
 * @param {string} to - Phone number to call (lead's phone number)
 * @param {string} answerUrl - URL where Plivo will send the call control XML
 * @param {Object} options - Additional call options
 * @returns {Promise<Object>} - Plivo API response with call details
 */
export const makeCall = async (from, to, answerUrl, options = {}) => {
  try {
    const response = await plivoClient.calls.create(
      from,
      [to],
      answerUrl,
      {
        answerMethod: 'POST',
        callerId: from,
        ...options
      }
    );

    return {
      success: true,
      callUuid: response.messageUuid || response.callUuid,
      apiId: response.apiId,
      message: response.message
    };
  } catch (error) {
    console.error('Error making Plivo call:', error);
    throw new Error(`Failed to make call: ${error.message}`);
  }
};

/**
 * Generate Plivo XML for call control
 * @param {Object} options - XML generation options
 * @returns {string} - Plivo XML string
 */
export const generateCallXML = (options = {}) => {
  const {
    action = 'dial',
    targetNumber = null,
    record = false,
    recordActionUrl = null,
    speakText = null,
    hangupOnStar = false
  } = options;

  const response = new plivo.Response();

  switch (action) {
    case 'dial':
      if (targetNumber) {
        const dial = response.addDial({
          callerId: process.env.PLIVO_PHONE_NUMBER,
          record: record ? 'true' : 'false',
          action: recordActionUrl,
          method: 'POST'
        });
        dial.addNumber(targetNumber);
      }
      break;

    case 'speak':
      if (speakText) {
        response.addSpeak(speakText);
      }
      break;

    case 'hangup':
      response.addHangup();
      break;

    case 'conference':
      const conference = response.addConference({
        enterSound: 'beep:1',
        exitSound: 'beep:2',
        startConferenceOnEnter: 'true',
        endConferenceOnExit: 'false'
      });
      conference.addNumber(targetNumber);
      break;
  }

  return response.toXML();
};

/**
 * Validate Plivo webhook signature
 * @param {string} signature - X-Plivo-Signature-V3 header
 * @param {string} nonce - X-Plivo-Signature-V3-Nonce header
 * @param {string} uri - Request URI
 * @param {string} method - Request method (GET/POST)
 * @param {Object} body - Request body
 * @returns {boolean} - True if signature is valid
 */
export const validateWebhookSignature = (signature, nonce, uri, method, body) => {
  try {
    return plivo.utils.validateSignatureV3(
      process.env.PLIVO_AUTH_TOKEN,
      signature,
      nonce,
      uri,
      method,
      body
    );
  } catch (error) {
    console.error('Error validating Plivo signature:', error);
    return false;
  }
};

/**
 * Get call details from Plivo
 * @param {string} callUuid - Plivo call UUID
 * @returns {Promise<Object>} - Call details
 */
export const getCallDetails = async (callUuid) => {
  try {
    const response = await plivoClient.calls.get(callUuid);
    return {
      success: true,
      callDetails: response
    };
  } catch (error) {
    console.error('Error getting call details:', error);
    throw new Error(`Failed to get call details: ${error.message}`);
  }
};

/**
 * Hang up an active call
 * @param {string} callUuid - Plivo call UUID
 * @returns {Promise<Object>} - API response
 */
export const hangupCall = async (callUuid) => {
  try {
    const response = await plivoClient.calls.hangup(callUuid);
    return {
      success: true,
      message: 'Call hung up successfully',
      response
    };
  } catch (error) {
    console.error('Error hanging up call:', error);
    throw new Error(`Failed to hang up call: ${error.message}`);
  }
};

/**
 * Get recording details
 * @param {string} recordingId - Plivo recording ID
 * @returns {Promise<Object>} - Recording details
 */
export const getRecording = async (recordingId) => {
  try {
    const response = await plivoClient.recordings.get(recordingId);
    return {
      success: true,
      recordingUrl: response.recordingUrl,
      recordingDetails: response
    };
  } catch (error) {
    console.error('Error getting recording:', error);
    throw new Error(`Failed to get recording: ${error.message}`);
  }
};

/**
 * Delete a recording
 * @param {string} recordingId - Plivo recording ID
 * @returns {Promise<Object>} - API response
 */
export const deleteRecording = async (recordingId) => {
  try {
    await plivoClient.recordings.delete(recordingId);
    return {
      success: true,
      message: 'Recording deleted successfully'
    };
  } catch (error) {
    console.error('Error deleting recording:', error);
    throw new Error(`Failed to delete recording: ${error.message}`);
  }
};

export default {
  makeCall,
  generateCallXML,
  validateWebhookSignature,
  getCallDetails,
  hangupCall,
  getRecording,
  deleteRecording
};
