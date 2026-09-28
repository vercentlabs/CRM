import pool from '../config/db.js';
import { generateCallXML } from '../services/plivo.service.js';

/**
 * Handle Plivo answer webhook
 * @route   POST /api/plivo/webhook/answer
 * @desc    Handle incoming Plivo call answer events
 * @access  Plivo only (X-Plivo-Signature-V3 verified by middleware)
 */
const handleAnswer = async (req, res) => {
  try {
    // Signature already verified by verifyPlivoSignature (see plivo.routes.js)
    const { CallUUID, From, To, Direction, CallStatus } = req.body;
    console.log('Plivo answer webhook:', { CallUUID, From, To, Direction, CallStatus });

    // Update call status in database
    const updateCallQuery = `
      UPDATE calls
      SET call_status = $1,
          start_time = NOW(),
          updated_at = NOW()
      WHERE plivo_call_uuid = $2
    `;

    pool.query(updateCallQuery, [CallStatus === 'in-progress' ? 'Completed' : CallStatus, CallUUID], (error) => {
      if (error) {
        console.error('Error updating call status:', error);
      }
    });

    // Generate Plivo XML to control the call
    const xml = generateCallXML({
      action: 'dial',
      targetNumber: From,
      record: true,
      recordActionUrl: `${process.env.PLIVO_WEBHOOK_URL}/recording`
    });

    res.set('Content-Type', 'text/xml');
    res.send(xml);
  } catch (error) {
    console.error('Error handling Plivo answer webhook:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Handle Plivo recording webhook
 * @route   POST /api/plivo/webhook/recording
 * @desc    Handle Plivo recording callbacks
 * @access  Plivo only (X-Plivo-Signature-V3 verified by middleware)
 */
const handleRecording = async (req, res) => {
  try {
    // Signature already verified by verifyPlivoSignature (see plivo.routes.js)
    const { CallUUID, RecordingUrl, RecordingDuration, RecordingID } = req.body;
    console.log('Plivo recording webhook:', { CallUUID, RecordingUrl, RecordingDuration, RecordingID });

    // Update call record with recording details
    const updateCallQuery = `
      UPDATE calls
      SET recording_url = $1,
          duration_seconds = $2,
          recording_id = $3,
          updated_at = NOW()
      WHERE plivo_call_uuid = $4
    `;

    pool.query(updateCallQuery, [RecordingUrl, RecordingDuration, RecordingID, CallUUID], (error) => {
      if (error) {
        console.error('Error updating call with recording:', error);
      }
    });

    res.status(200).json({ message: 'Recording received' });
  } catch (error) {
    console.error('Error handling Plivo recording webhook:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Handle Plivo call status webhook
 * @route   POST /api/plivo/webhook/status
 * @desc    Handle Plivo call status updates
 * @access  Plivo only (X-Plivo-Signature-V3 verified by middleware)
 */
const handleCallStatus = async (req, res) => {
  try {
    // Signature already verified by verifyPlivoSignature (see plivo.routes.js)
    const { CallUUID, CallStatus, CallDuration, HangupCause } = req.body;
    console.log('Plivo call status webhook:', { CallUUID, CallStatus, CallDuration, HangupCause });

    // Update call status in database
    const updateCallQuery = `
      UPDATE calls
      SET call_status = $1,
          duration_seconds = $2,
          end_time = NOW(),
          updated_at = NOW()
      WHERE plivo_call_uuid = $3
    `;

    const statusMap = {
      'completed': 'Completed',
      'failed': 'Cancelled',
      'busy': 'Missed',
      'no-answer': 'Missed',
      'canceled': 'Cancelled'
    };

    const mappedStatus = statusMap[CallStatus] || CallStatus;

    pool.query(updateCallQuery, [mappedStatus, CallDuration, CallUUID], (error) => {
      if (error) {
        console.error('Error updating call status:', error);
      }
    });

    res.status(200).json({ message: 'Call status received' });
  } catch (error) {
    console.error('Error handling Plivo call status webhook:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export {
  handleAnswer,
  handleRecording,
  handleCallStatus
};
