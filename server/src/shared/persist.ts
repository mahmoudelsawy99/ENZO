import type { ClientSession, Document } from 'mongoose';

export async function saveDoc(doc: Document, session: ClientSession | null): Promise<void> {
  if (session) {
    await doc.save({ session });
    return;
  }
  await doc.save();
}
