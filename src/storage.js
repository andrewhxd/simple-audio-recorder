import { Bytes, collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, writeBatch } from 'firebase/firestore/lite';
import { db } from './firebase.js';

// Recordings are stored in Cloud Firestore. The project is on the free Spark plan,
// which has no Cloud Storage bucket, so the audio itself goes into Firestore too:
//
//   recordings/{id}              name, fileName, type, size, chunkCount, createdAt
//   recordings/{id}/chunks/{i}   data: up to 1 MB of the audio (documents max out at 1 MiB)
//
// The list only reads the small recordings/{id} documents; audio downloads when one is picked.

const CHUNK_SIZE = 1_000_000; // bytes per chunk document
const MAX_CHUNKS = 5; // must match firestore.rules
export const MAX_SIZE = CHUNK_SIZE * MAX_CHUNKS; // 5 MB, about 15 minutes of phone audio

// Upload { name, fileName, blob } in one batch, so it saves completely or not at all. Returns the new id.
export async function addRecording({ blob, ...details }) {
  if (blob.size > MAX_SIZE) throw new Error('the recording is too long to upload (5 MB max)');

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunkCount = Math.ceil(bytes.length / CHUNK_SIZE);
  const recordingRef = doc(collection(db, 'recordings')); // new auto-generated id

  const batch = writeBatch(db);
  batch.set(recordingRef, { ...details, type: blob.type, size: bytes.length, chunkCount, createdAt: serverTimestamp() });
  for (let i = 0; i < chunkCount; i++) {
    const piece = bytes.subarray(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    batch.set(doc(recordingRef, 'chunks', String(i)), { data: Bytes.fromUint8Array(piece) });
  }
  await batch.commit();
  return recordingRef.id;
}

// List saved recordings, newest first (details only, no audio).
export async function listRecordings() {
  const snapshot = await getDocs(query(collection(db, 'recordings'), orderBy('createdAt', 'desc')));
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Download a recording's chunks and join them back into one audio Blob.
export async function loadAudio(recording) {
  const chunkDocs = await Promise.all(
    Array.from({ length: recording.chunkCount }, (_, i) => getDoc(doc(db, 'recordings', recording.id, 'chunks', String(i)))),
  );
  // Someone (maybe on another device) may have deleted it since the list was loaded.
  if (!chunkDocs.every((d) => d.exists())) throw new Error('this recording was deleted');
  return new Blob(chunkDocs.map((d) => d.data().data.toUint8Array()), { type: recording.type });
}

// Delete a recording and all of its chunks together.
export async function deleteRecording(recording) {
  const batch = writeBatch(db);
  for (let i = 0; i < recording.chunkCount; i++) {
    batch.delete(doc(db, 'recordings', recording.id, 'chunks', String(i)));
  }
  batch.delete(doc(db, 'recordings', recording.id));
  await batch.commit();
}
