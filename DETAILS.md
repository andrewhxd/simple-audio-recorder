# Simple Audio Recorder (React + Vite + Firebase)

A microphone recorder built for phones (iPhone and Android).
Recordings are saved to Cloud Firestore, so every device sees the same list.

**Live demo:** https://fast-audio-playback-demo.web.app

## Run it

1. Install Node.js 20.19+ or 22.12+.
2. Run `npm install` in this folder.
3. On a computer, run `npm run dev` and open `http://localhost:5173`.

### On a phone

The easiest way is the live demo, https://fast-audio-playback-demo.web.app, which has a real HTTPS certificate.

To test local changes on a phone, note that phones only allow the microphone on HTTPS, so use:

```bash
npm run dev:mobile
```

1. Connect the phone to the same Wi-Fi as your computer.
2. Open the `Network: https://...` address printed in the terminal.
3. The certificate is self-signed, so the browser shows a warning the first time.
On iPhone tap **Show Details > visit this website**, on Android tap **Advanced > Proceed**.
4. Allow microphone access when asked.

## What it does

1. **Record / Stop**: records the microphone with `MediaRecorder`.
2. **Title**: optionally name the recording (blank saves as "Untitled").
The title is also the file name when a copy is saved to Files or Downloads.
3. **Save to**: pick where the recording goes, then tap **Save**.
4. **Saved recordings**: lists every saved recording, newest first, as "Title · date saved".
Type in the search box to filter by title or date ("standup", "Oct 13", "10/13/2026", "Tuesday").
Picking one loads it into the player below the list; press play to listen.
**Delete** asks for confirmation in the page, then removes it from the cloud.
Copies already saved to Files or Downloads are not touched.

## Microphone permission

The browser remembers microphone permission per site, so pick the "always" option when it asks:

- **Chrome (computer or Android)**: choose **Allow while visiting the site** / **Allow on every visit**, not **Allow this time**.
- **Safari on Mac**: Safari > Settings > Websites > Microphone, set the site to **Allow**.
- **Safari on iPhone**: tap **aA** in the address bar > Website Settings > Microphone > **Allow**.

Each port is a separate site (`localhost:5173` and `localhost:5174` are asked separately).
Chrome does not remember permissions for sites with certificate warnings, so with `npm run dev:mobile` it asks every visit.

## Where recordings are stored

Every saved recording is uploaded to Cloud Firestore (see [Firebase](#firebase) below), so the list works on any device.
The **Save to** choice can also copy it to a real file on the phone:

| Save to | iPhone (Safari) | Android (Chrome) |
| --- | --- | --- |
| Cloud only | Cloud only | Cloud only |
| Choose a location | Share sheet: **Save to Files** lets you pick any folder (On My iPhone, iCloud Drive, Google Drive...) | Share sheet: Drive, Files, or any app that accepts audio |
| Downloads folder | Files app > Downloads | Downloads folder |

The choice is remembered between visits.
"Choose a location" only appears in browsers that support sharing files.

Files are named like `Recording 2026-10-13 09.30.05.m4a`.
The app records AAC `.m4a` when the browser supports it (Safari, Chrome), which every phone can open.
Firefox falls back to `.webm` or `.ogg`.

### Limits of a web app

- A website can't pick a folder once and save there automatically on a phone.
The share sheet asks each time.
That needs a native app (for example, wrapping this one with Capacitor).

## Firebase

- **Project:** `fast-audio-playback-demo`, on the free Spark plan.
- **Web app:** "Simple Audio Recorder" (config in `src/firebase.js`; it identifies the project and is not a secret).
- **Database:** Cloud Firestore, Standard edition, location `nam5`.
- **Hosting:** https://fast-audio-playback-demo.web.app (serves the `dist` build).

### Why the audio lives in Firestore, not a Storage bucket

Since February 2026, Cloud Storage buckets require the Blaze (pay-as-you-go) plan, so a Spark project can't upload files to one.
Instead, each recording is stored in Firestore:

```
recordings/{id}              name, fileName, type, size, chunkCount, createdAt
recordings/{id}/chunks/{i}   data: up to 1 MB of the audio bytes
```

Firestore documents max out at 1 MiB, so the audio is split into chunks.
The list only reads the small `recordings` documents, and the audio downloads when one is picked.
Standard edition is used because it bills per document, not per kilobyte: a recording costs about 2 writes, against a free allowance of 20,000 writes a day.

Limits on the free plan:

- 5 MB per recording (about 15 minutes of phone audio).
- 1 GiB stored in total, 50,000 reads and 20,000 writes per day, 10 GiB downloaded per month.
- A brand-new database briefly refuses very large bursts of writes; the app shows "the cloud is busy" if that happens.

If you upgrade to Blaze later, the usual design is to put the audio files in Cloud Storage and keep only a link in Firestore.

### Security rules

There is no sign-in yet, so **anyone with the link can list, play, save, and delete recordings**.
`firestore.rules` limits the damage:
- Recordings must have exactly the expected fields, with size limits.
- Audio chunks can only be written in the same save as their recording.
- Nothing can be edited after saving, and a recording can only be deleted together with its audio.
- Every other path is denied.

Treat these rules as a prototype: add Firebase Authentication (or App Check) before sharing the link widely.

### Deploy

```bash
npm run build
npx -y firebase-tools@latest deploy --only hosting,firestore
```

## Code

- `src/App.jsx`: the recorder UI and `MediaRecorder` logic.
- `src/firebase.js`: connects to the Firebase project.
- `src/storage.js`: saves, lists, loads, and deletes recordings in Firestore.
- `src/audioCache.js`: keeps played recordings in memory (up to 200 MB, least recently played dropped first) so replays don't download again.
- `src/LiveWaveform.jsx`: the live volume bars shown while recording.
- `src/files.js`: audio format, file names, share sheet, and download.
- `src/styles.css`: a small mobile-friendly stylesheet.
