// Helpers for turning a recording into a real file on the phone.

// Prefer AAC .m4a: every iPhone and Android phone can open it.
// Browsers that can't record it fall back to webm or ogg.
export function pickAudioFormat() {
  const formats = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/ogg;codecs=opus'];
  return formats.find((format) => MediaRecorder.isTypeSupported(format)) || '';
}

// Wrap a saved recording in a File with a readable name, e.g. "Recording 2026-10-13 09.30.05.m4a".
export function toFile(recording) {
  const type = recording.blob.type.split(';')[0]; // share sheets reject the ";codecs=..." part
  const extension = { 'audio/mp4': 'm4a', 'audio/webm': 'webm', 'audio/ogg': 'ogg' }[type] || 'audio';
  return new File([recording.blob], `${recording.fileName || 'Recording'}.${extension}`, { type });
}

// Build a file name that is safe on every file system (no slashes or colons).
// Uses the title if there is one, otherwise the date, e.g. "Recording 2026-10-13 09.30.05".
export function makeFileName(date, title = '') {
  const safeTitle = title.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 100);
  if (safeTitle) return safeTitle;
  const pad = (n) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}.${pad(date.getMinutes())}.${pad(date.getSeconds())}`;
  return `Recording ${day} ${time}`;
}

// True if this browser can hand audio files to the phone's share sheet.
export function canShareFiles() {
  const testFile = new File([''], 'test.m4a', { type: 'audio/mp4' });
  return Boolean(navigator.canShare?.({ files: [testFile] }));
}

// Open the share sheet. On iPhone, "Save to Files" lets you pick any folder.
// Falls back to a download if this particular file can't be shared.
export async function shareFile(file) {
  if (!navigator.canShare?.({ files: [file] })) return downloadFile(file);
  try {
    await navigator.share({ files: [file] });
  } catch (err) {
    if (err.name !== 'AbortError') throw err; // AbortError just means the sheet was closed
  }
}

// Download the file. iPhone: Files app > Downloads. Android: the Downloads folder.
export function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000); // keep the URL alive while the download starts
}
