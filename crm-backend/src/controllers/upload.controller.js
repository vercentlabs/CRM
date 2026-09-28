import { uploadFile } from '../services/upload.service.js';

/**
 * Upload file to ImageKit
 * @route   POST /api/upload/chat-attachment
 * @desc    Upload a file for chat attachment
 * @access  Private
 */
export const uploadChatAttachment = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: 'No file uploaded'
      });
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (req.file.size > maxSize) {
      return res.status(400).json({
        message: 'File size exceeds 10MB limit'
      });
    }

    // Upload file to ImageKit
    const uploadResult = await uploadFile(req.file, 'chat/attachments');

    res.status(200).json({
      message: 'File uploaded successfully',
      data: uploadResult
    });
  } catch (error) {
    console.error('Error uploading chat attachment:', error);
    res.status(500).json({
      message: 'Failed to upload file',
      error: error.message
    });
  }
};
