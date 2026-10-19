# simple audio recorder

its a website that records audio from ur mic and saves it to the cloud.
works on phones and computers.

## demo

try it here: https://fast-audio-playback-demo.web.app

press record, press stop, give it a name if u want, press save.
then it shows up in the list and u can play it or delete it.

heads up: theres no login yet so anyone with the link can see and delete recordings.
dont record anything private lol

## how to get it on ur computer

you need [Node.js](https://nodejs.org) (version 20 or newer) and git.

1. go to https://github.com/andrewhxd/simple-audio-recorder and hit fork (top right) so u have ur own copy
2. clone ur fork (put ur github name instead of YOUR-USERNAME):

```bash
git clone https://github.com/YOUR-USERNAME/simple-audio-recorder.git
cd simple-audio-recorder
```

3. install stuff:

```bash
npm install
```

4. run it:

```bash
npm run dev
```

5. open http://localhost:5173 in ur browser and allow the mic when it asks

## testing on ur phone

phones only let websites use the mic on https so do this instead:

```bash
npm run dev:mobile
```

then put ur phone on the same wifi as ur computer and open the `Network: https://...` link it prints.
it will say the site isnt safe, thats fine, just tap advanced / show details and go to the site anyway.

or just use the demo link on ur phone, thats easier.

## how to work on it

1. make a new branch so u dont mess up main:

```bash
git checkout -b my-cool-change
```

2. change stuff, the page reloads by itself when u save a file
3. commit and push:

```bash
git add .
git commit -m "what i changed"
git push origin my-cool-change
```

4. go to github and make a pull request so the rest of us can look at it

## where the code is

- `src/App.jsx` - the main page, record button and all that
- `src/storage.js` - saving and loading recordings from firebase
- `src/LiveWaveform.jsx` - the bars that move when ur talking
- `src/files.js` - file names and saving to ur phone
- `src/styles.css` - how it looks

the recordings are saved in firebase (firestore).
u dont need to set anything up for that, it already connects when u run it.
just know that ur local version uses the same database as the demo, so if u delete stuff locally its gone for real.

## putting it on the demo site

only people added to the firebase project can do this, ask me if u need access.

```bash
npm run build
npx -y firebase-tools@latest deploy --only hosting,firestore --project fast-audio-playback-demo
```

## more info

if u want the long nerdy version with all the details read [DETAILS.md](DETAILS.md)
