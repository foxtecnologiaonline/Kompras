import { Directory, File, Paths } from 'expo-file-system';

const RECEIPTS_DIR_NAME = 'receipts';

/**
 * Camera/picker results live in a temporary cache location that the OS can
 * clear at any time. Copies the photo into the app's persistent document
 * directory so it survives for as long as the purchase record does.
 */
export async function persistReceiptPhoto(sourceUri: string): Promise<string> {
  const dir = new Directory(Paths.document, RECEIPTS_DIR_NAME);
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }
  const fileName = `receipt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const dest = new File(dir, fileName);
  const source = new File(sourceUri);
  await source.copy(dest);
  return dest.uri;
}
