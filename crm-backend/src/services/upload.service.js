import imagekit from '../config/imagekit.js';

/**
 * Upload file to ImageKit
 * @param {File} file - File object to upload
 * @param {string} folder - Folder path in ImageKit (e.g., 'chat/attachments')
 * @returns {Promise<Object>} - Uploaded file details
 */
export const uploadFile = async (file, folder = 'chat/attachments') => {
  try {
    // Multer stores the file in memory as a buffer
    const uploadResponse = await imagekit.upload({
      file: file.buffer,
      fileName: file.originalname,
      folder: folder,
      useUniqueFileName: true,
      tags: ['chat', 'attachment']
    });

    return {
      success: true,
      url: uploadResponse.url,
      fileId: uploadResponse.fileId,
      name: uploadResponse.name,
      size: uploadResponse.size,
      fileType: uploadResponse.fileType
    };
  } catch (error) {
    console.error('Error uploading file to ImageKit:', error);
    throw new Error('Failed to upload file');
  }
};

/**
 * Delete file from ImageKit
 * @param {string} fileId - ImageKit file ID
 * @returns {Promise<Object>} - Deletion result
 */
export const deleteFile = async (fileId) => {
  try {
    await imagekit.deleteFile(fileId);
    return { success: true };
  } catch (error) {
    console.error('Error deleting file from ImageKit:', error);
    throw new Error('Failed to delete file');
  }
};

/**
 * Get file details from ImageKit
 * @param {string} fileId - ImageKit file ID
 * @returns {Promise<Object>} - File details
 */
export const getFileDetails = async (fileId) => {
  try {
    const fileDetails = await imagekit.getFileDetails(fileId);
    return fileDetails;
  } catch (error) {
    console.error('Error getting file details from ImageKit:', error);
    throw new Error('Failed to get file details');
  }
};
