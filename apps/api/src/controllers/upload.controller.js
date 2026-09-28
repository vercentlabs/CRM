import { uploadFile } from '../services/upload.service.js';
import { serverError } from '../platform/tenancy.js';

/**
 * Upload file to ImageKit
 * @route   POST /api/upload/chat-attachment
 * @desc    Upload a file for chat attachment
 * @access  crm.chat.use. Files are stored under the organization's own folder.
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

    // Tenant-partitioned storage path (public UUID, never the numeric id)
    const folder = `organizations/${req.auth.organizationPublicId}/chat/attachments`;
    const uploadResult = await uploadFile(req.file, folder);

    res.status(200).json({
      message: 'File uploaded successfully',
      data: uploadResult
    });
  } catch (error) {
    return serverError(res, 'Failed to upload file', error);
  }
};
