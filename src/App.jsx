import { useEffect, useRef, useState } from 'react';
import { addRecording, deleteRecording, listRecordings, loadAudio } from './storage.js';
import { canShareFiles, downloadFile, makeFileName, pickAudioFormat, shareFile, toFile } from './files.js';
import LiveWaveform, { wakeAudio } from './LiveWaveform.jsx';
import { createAudioCache } from './audioCache.js';

const shareSupported = canShareFiles();

// Played recordings stay in memory (RAM) for instant replays, up to 200 MB in total
// (a safe margin for phone browsers); past that, the least recently played ones are dropped
// and download again if picked.
const audioCache = createAudioCache(200 * 1024 ** 2);

// Remember the chosen save location between visits (storage can be blocked, e.g. private mode).
function loadSaveTo() {
  try {
    const saveTo = localStorage.getItem('saveTo') || 'app';
    return saveTo === 'share' && !shareSupported ? 'app' : saveTo;
  } catch {
    return 'app';
  }
}

// When a recording was saved, e.g. "Oct 13, 10:24 AM" (the year is added if it's not this year).
function formatSavedAt(recording) {
  const date = recording.createdAt.toDate();
  const options = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
  if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric';
  return date.toLocaleString(undefined, options);
}

// True if every word typed in the search box appears in the title or the save date.
// The date can be typed many ways: "Oct 13", "October 13", "10/13/2026", "Tuesday".
function matchesSearch(recording, search) {
  const date = recording.createdAt.toDate();
  const text = [
    recording.name,
    formatSavedAt(recording),
    date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
    date.toLocaleDateString(),
  ].join(' ').toLowerCase();
  return search.toLowerCase().split(/\s+/).every((word) => text.includes(word));
}

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [liveStream, setLiveStream] = useState(null); // the mic, while recording (drives the waveform)
  const [newBlob, setNewBlob] = useState(null); // latest take, not saved yet
  const [saved, setSaved] = useState([]); // recordings in Firestore (details only, newest first)
  const [selectedId, setSelectedId] = useState('');
  const [title, setTitle] = useState(''); // title for the next save
  const [search, setSearch] = useState(''); // filters the saved list
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [notice, setNotice] = useState(''); // short confirmation, e.g. after deleting
  const [saveTo, setSaveTo] = useState(loadSaveTo); // 'app' (cloud only), 'share' or 'downloads'
  const [audioUrl, setAudioUrl] = useState('');
  const [saving, setSaving] = useState(false); // uploading to the cloud
  const [loading, setLoading] = useState(false); // downloading a saved recording
  const [error, setError] = useState('');

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const wantedIdRef = useRef(''); // the recording most recently picked, to ignore slower earlier loads

  // Reload the saved list from the cloud (other devices may have added or deleted recordings).
  function refreshList() {
    return listRecordings().then(setSaved).catch((err) => setError(`Could not load recordings: ${err.message}`));
  }

  // Load the list of saved recordings when the page opens.
  useEffect(() => {
    refreshList();
  }, []);

  // Free a recording's memory once the player has switched away from it.
  // (Freeing it earlier breaks Safari, which keeps reading the audio while it plays.)
  useEffect(() => () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  // Put a recording in the audio player (null empties it).
  function showInPlayer(blob) {
    setAudioUrl(blob ? URL.createObjectURL(blob) : '');
  }

  async function startRecording() {
    setError('');
    setNotice('');
    setConfirmingDelete(false);
    wakeAudio(); // must happen during the tap, before any waiting, for iPhone
    try {
      // Ask for microphone access.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickAudioFormat();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];

      // The recorder hands us audio in pieces; collect them.
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      // After stopping, join the pieces into one audio file.
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop()); // turn off the mic
        setLiveStream(null);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        // Stopping right away (before the mic warms up) can leave nothing to play or save.
        if (blob.size === 0) {
          setError('No audio was captured. Try recording again.');
          return;
        }
        setNewBlob(blob);
        showInPlayer(blob);
      };

      recorder.start();
      setIsRecording(true);
      setLiveStream(stream);
      // Clear the old take so nothing stale shows or saves while the new one finishes.
      setNewBlob(null);
      setSelectedId('');
      wantedIdRef.current = '';
      showInPlayer(null);
    } catch (err) {
      setError(`Could not start recording: ${err.message}`);
    }
  }

  function stopRecording() {
    recorderRef.current.stop();
    setIsRecording(false);
  }

  function changeSaveTo(event) {
    setSaveTo(event.target.value);
    try {
      localStorage.setItem('saveTo', event.target.value);
    } catch {
      // Not remembered, but the choice still works for this visit.
    }
  }

  // Upload the take to the cloud list, and also copy it to the chosen location.
  async function saveRecording() {
    setError('');
    setNotice('');
    setSaving(true);
    const now = new Date();
    const name = title.trim() || 'Untitled';
    const recording = { name, fileName: makeFileName(now, title), blob: newBlob };

    // Start the share sheet or download first: phones only allow it right after a tap.
    let copying;
    if (saveTo === 'share') copying = shareFile(toFile(recording));
    if (saveTo === 'downloads') copying = downloadFile(toFile(recording));

    try {
      const id = await addRecording(recording);
      audioCache.add(id, newBlob);
      setSaved(await listRecordings());
      setSelectedId(id);
      wantedIdRef.current = id;
      setNewBlob(null); // already saved, so disable Save
      setTitle('');
      setSearch(''); // so the new recording shows in the list
      await copying;
    } catch (err) {
      // Firestore briefly limits how much a database can take in at once.
      const busy = err.code === 'resource-exhausted';
      setError(`Could not save: ${busy ? 'the cloud is busy. Wait a minute and try again.' : err.message}`);
    }
    setSaving(false);
  }

  // Delete the recording picked in the dropdown (after the in-page "Yes, delete" button).
  // A browser confirm() popup isn't used: some browsers silently block it, so Delete did nothing.
  async function deleteSelected() {
    const recording = saved.find((r) => r.id === selectedId);
    setConfirmingDelete(false);
    setError('');
    try {
      await deleteRecording(recording);
      audioCache.remove(recording.id);
      setSaved(await listRecordings());
      setSelectedId('');
      wantedIdRef.current = '';
      showInPlayer(null); // it was the one in the player
      setNotice(`Deleted "${recording.name}".`);
    } catch (err) {
      setError(`Could not delete: ${err.message}`);
      refreshList(); // it may already have been deleted on another device
    }
  }

  // Download (or reuse) whichever saved recording was picked, and put it in the player.
  async function selectRecording(event) {
    const recording = saved.find((r) => r.id === event.target.value);
    if (!recording) return;
    setSelectedId(recording.id);
    wantedIdRef.current = recording.id;
    setError('');
    setNotice('');
    setConfirmingDelete(false);
    showInPlayer(null);

    try {
      let blob = audioCache.get(recording.id);
      if (!blob) {
        setLoading(true);
        blob = await loadAudio(recording);
        audioCache.add(recording.id, blob);
      }
      // Only show it if it's still the one picked (a slow download can finish after a newer pick).
      if (wantedIdRef.current === recording.id) showInPlayer(blob);
    } catch (err) {
      // Ignore failures for a recording that's no longer picked (e.g. it was just deleted).
      if (wantedIdRef.current === recording.id) {
        setError(`Could not load recording: ${err.message}`);
        refreshList();
      }
    }
    if (wantedIdRef.current === recording.id) setLoading(false);
  }

  // Recordings matching the search (the picked one always stays, so the dropdown keeps showing it).
  const matches = saved.filter((r) => matchesSearch(r, search.trim()));
  const shown = saved.filter((r) => r.id === selectedId || matches.includes(r));
  const selected = saved.find((r) => r.id === selectedId);

  let placeholder = 'Pick one to play';
  if (!saved.length) placeholder = 'No saved recordings yet';
  else if (search.trim()) placeholder = `${matches.length} ${matches.length === 1 ? 'match' : 'matches'}`;

  return (
    <main>
      <h1>Audio Recorder</h1>

      <button
        className={isRecording ? 'record recording' : 'record'}
        onClick={isRecording ? stopRecording : startRecording}
      >
        {isRecording ? 'Stop' : 'Record'}
      </button>

      {liveStream && <LiveWaveform stream={liveStream} />}
      {/* A new take plays here; saved recordings play under the list below. */}
      {audioUrl && !selectedId && <audio controls src={audioUrl} />}

      <section>
        <label htmlFor="title">Title</label>
        <input
          id="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Untitled"
          maxLength={100}
          enterKeyHint="done"
        />

        <label htmlFor="save-to">Save to</label>
        <div className="row">
          <select id="save-to" value={saveTo} onChange={changeSaveTo}>
            <option value="app">Cloud only</option>
            {shareSupported && <option value="share">Choose a location (Files, Drive...)</option>}
            <option value="downloads">Downloads folder</option>
          </select>
          <button onClick={saveRecording} disabled={!newBlob || isRecording || saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
        <p className="hint">Every save also goes to the cloud list below.</p>
      </section>

      <section>
        <label htmlFor="saved">Saved recordings</label>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by title or date"
          aria-label="Search saved recordings"
          disabled={!saved.length}
        />
        <div className="row">
          <select id="saved" value={selectedId} onChange={selectRecording} disabled={isRecording}>
            <option value="" disabled>{placeholder}</option>
            {shown.map((r) => (
              <option key={r.id} value={r.id}>{r.name} · {formatSavedAt(r)}</option>
            ))}
          </select>
          <button
            className="danger"
            onClick={() => setConfirmingDelete(true)}
            disabled={!selectedId || isRecording || confirmingDelete}
          >
            Delete
          </button>
        </div>
        {confirmingDelete && (
          <div className="confirm">
            <p>Delete "{selected.name}" for everyone?</p>
            <div className="row">
              <button className="danger" onClick={deleteSelected}>Yes, delete</button>
              <button onClick={() => setConfirmingDelete(false)}>Cancel</button>
            </div>
          </div>
        )}
        {notice && <p className="hint">{notice}</p>}
        {loading && <p className="hint">Loading recording...</p>}
        {audioUrl && selectedId && <audio controls src={audioUrl} />}
      </section>

      {error && <p className="error" role="alert">{error}</p>}
    </main>
  );
}
