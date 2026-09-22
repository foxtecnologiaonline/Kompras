import { Directory, File, Paths } from 'expo-file-system';

const RECEIPTS_DIR_NAME = 'receipts';

/**
 * Camera/picker results live in a temporary cache location that the OS can
 * clear at any time. Copies the file into the app's persistent document
 * directory so it survives for as long as the purchase record does.
 */
async function persistReceiptAttachment(sourceUri: string, extension: string): Promise<string> {
  const dir = new Directory(Paths.document, RECEIPTS_DIR_NAME);
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }
  const fileName = `receipt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension}`;
  const dest = new File(dir, fileName);
  const source = new File(sourceUri);
  await source.copy(dest);
  return dest.uri;
}

export async function persistReceiptPhoto(sourceUri: string): Promise<string> {
  return persistReceiptAttachment(sourceUri, '.jpg');
}

/** Same as persistReceiptPhoto, but keeps the original file's extension (e.g. ".pdf"). */
export async function persistReceiptDocument(sourceUri: string, originalName?: string): Promise<string> {
  const extension = originalName?.match(/\.[a-z0-9]+$/i)?.[0] ?? '.pdf';
  return persistReceiptAttachment(sourceUri, extension);
}
