import ImageKit from 'imagekit';

/** ImageKit storage adapter (provider swap/lifecycle is a Phase 6 concern). */

export interface StoredFile {
  url: string;
  fileId: string;
  name: string;
  size: number;
  fileType: string;
}

export interface FileStorage {
  upload(input: {
    buffer: Buffer;
    fileName: string;
    folder: string;
    tags: string[];
  }): Promise<StoredFile>;
}

// The SDK client is constructed at import time (it requires credentials).
const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY ?? '',
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY ?? '',
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT ?? '',
});

export const imageKitStorage: FileStorage = {
  async upload({ buffer, fileName, folder, tags }) {
    const response = await imagekit.upload({
      file: buffer,
      fileName,
      folder,
      useUniqueFileName: true,
      tags,
    });
    return {
      url: response.url,
      fileId: response.fileId,
      name: response.name,
      size: response.size,
      fileType: response.fileType,
    };
  },
};
