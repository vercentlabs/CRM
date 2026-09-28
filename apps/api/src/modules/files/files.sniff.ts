/**
 * Content sniffing for uploads: the declared MIME type (from the client) must
 * match the file's leading bytes. Extensions are never trusted.
 */

type Family =
  | 'jpeg'
  | 'png'
  | 'gif'
  | 'webp'
  | 'pdf'
  | 'ole'
  | 'zip'
  | 'text'
  | 'ftyp'
  | 'mpeg'
  | 'avi'
  | 'asf';

/** Allowed MIME types → the content family they must match, and a safe extension. */
export const ALLOWED_TYPES: Record<string, { family: Family; ext: string }> = {
  'image/jpeg': { family: 'jpeg', ext: '.jpg' },
  'image/jpg': { family: 'jpeg', ext: '.jpg' },
  'image/png': { family: 'png', ext: '.png' },
  'image/gif': { family: 'gif', ext: '.gif' },
  'image/webp': { family: 'webp', ext: '.webp' },
  'application/pdf': { family: 'pdf', ext: '.pdf' },
  'application/msword': { family: 'ole', ext: '.doc' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    family: 'zip',
    ext: '.docx',
  },
  'application/vnd.ms-excel': { family: 'ole', ext: '.xls' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    family: 'zip',
    ext: '.xlsx',
  },
  'application/vnd.ms-powerpoint': { family: 'ole', ext: '.ppt' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': {
    family: 'zip',
    ext: '.pptx',
  },
  'text/plain': { family: 'text', ext: '.txt' },
  'video/mp4': { family: 'ftyp', ext: '.mp4' },
  'video/quicktime': { family: 'ftyp', ext: '.mov' },
  'video/mpeg': { family: 'mpeg', ext: '.mpeg' },
  'video/x-msvideo': { family: 'avi', ext: '.avi' },
  'video/x-ms-wmv': { family: 'asf', ext: '.wmv' },
};

const startsWith = (buf: Buffer, bytes: number[], offset = 0) =>
  buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b);
const ascii = (buf: Buffer, text: string, offset = 0) =>
  buf.length >= offset + text.length &&
  buf.toString('latin1', offset, offset + text.length) === text;

export function sniffFamily(buf: Buffer): Family | null {
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (ascii(buf, 'GIF87a') || ascii(buf, 'GIF89a')) return 'gif';
  if (ascii(buf, 'RIFF') && ascii(buf, 'WEBP', 8)) return 'webp';
  if (ascii(buf, 'RIFF') && ascii(buf, 'AVI ', 8)) return 'avi';
  if (ascii(buf, '%PDF-')) return 'pdf';
  if (startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'ole';
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) return 'zip';
  if (ascii(buf, 'ftyp', 4)) return 'ftyp';
  if (startsWith(buf, [0x00, 0x00, 0x01, 0xba]) || startsWith(buf, [0x00, 0x00, 0x01, 0xb3]))
    return 'mpeg';
  if (startsWith(buf, [0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11])) return 'asf';
  // Plain text: no NUL bytes and valid UTF-8 in the first 4 KB.
  const head = buf.subarray(0, 4096);
  if (head.length > 0 && !head.includes(0)) {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(head.subarray(0, lastCompleteUtf8(head)));
      return 'text';
    } catch {
      return null;
    }
  }
  return null;
}

/** Avoids failing on a multi-byte character cut at the 4 KB boundary. */
function lastCompleteUtf8(buf: Buffer): number {
  const end = buf.length;
  for (let i = 1; i <= 3 && end - i >= 0; i++) {
    const byte = buf[end - i]!;
    if ((byte & 0xc0) === 0xc0) return end - i; // lead byte of a truncated sequence
    if ((byte & 0x80) === 0) break;
  }
  return end;
}

export function matchesDeclaredType(declared: string, buf: Buffer): boolean {
  const allowed = ALLOWED_TYPES[declared];
  return allowed !== undefined && sniffFamily(buf) === allowed.family;
}

/** Display name: basename only, control/path characters removed, bounded length. */
export function sanitizeFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .replace(/[\p{Cc}<>:"|?*]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  return (cleaned || 'file').slice(0, 200);
}
