import { initializeApp } from 'firebase/app';
// Firestore Lite: one-off reads and writes only (no live listeners), which keeps the app much smaller.
import { getFirestore } from 'firebase/firestore/lite';

// Web app "Simple Audio Recorder" in the fast-audio-playback-demo project.
// This config only identifies the project; it is not a secret. Access is controlled by firestore.rules.
const firebaseConfig = {
  apiKey: 'AIzaSyDIbv33fzaWoRSUX-g-CjUGp8pSUdjX7RA',
  authDomain: 'fast-audio-playback-demo.firebaseapp.com',
  projectId: 'fast-audio-playback-demo',
  storageBucket: 'fast-audio-playback-demo.firebasestorage.app',
  messagingSenderId: '53074767935',
  appId: '1:53074767935:web:6f55aac88d3d539b53088a',
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
