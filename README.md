# Post Shortener (QVAC)

Paste a post, message or bio that's too long, pick a limit (X/Twitter 280, Bluesky 300, Threads 500, a bio at 150, or your own number), and an **on-device AI** rewrites it in up to three versions that **really fit**. Every version is checked by a real character counter, and anything over the limit is thrown away. Keep or drop hashtags, and see a live counter as you type.

It runs **on your own computer** using [QVAC](https://github.com/tetherto/qvac), Tether's open-source AI SDK.
No API key, no cloud service, and what you type never leaves your machine.

![screenshot](screenshot.png)

## SDK version

`@qvac/sdk` **0.19.0** (declared in `package.json`)

Functions used: `loadModel` and `completion` (with structured output via `responseFormat`), with the `LLAMA_3_2_1B_INST_Q4_0` model.

## Install

You need [Node.js](https://nodejs.org) 22 or newer and some free disk space for the model.

```bash
git clone https://github.com/misaki-codex/qvac-post-shortener.git
cd qvac-post-shortener
npm install
```

## Run

```bash
npm start
```

Then open **http://localhost:3069** (the address, not the HTML file). The first start downloads the model.
While it loads, a rule-based shortener (cut filler words, use short forms, trim at a word) is used instead.

## How it works

- AI models can't count characters reliably, so **`server.js` counts every version itself** and only returns the ones that fit. If none fit, it asks again with a stricter target.
- Characters are counted like most apps do (an emoji counts as one). Some apps count links differently, so the page suggests leaving a little room.
- The AI is told to keep names, dates and links, and never to add facts.
- The server listens on `127.0.0.1`, so only your own computer can reach it.

## Troubleshooting

If you see `RPC_INIT_TIMEOUT`, the QVAC worker was slow to start. `server.js` already waits 3 minutes.
Set `QVAC_RPC_INIT_TIMEOUT_MS` (milliseconds) before `npm start` to wait longer, and make sure no other
QVAC app is running at the same time. If you see `ERR_MODULE_NOT_FOUND`, delete the `node_modules` folder
and run `npm install` again (this usually means an install was interrupted, for example by a full disk).

## License

MIT
