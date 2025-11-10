# Between Verses OSC Bridge

A tiny Node.js bridge that serves the Between Verses web app and forwards WebSocket commands as OSC messages to Modul8.

## Requirements

- Node.js 18 or newer
- Modul8 listening for OSC on `MODUL8_PORT` (default 8000)

## Install & Run

```
cd osc-bridge
npm install
cp .env.example .env   # optional, edit if needed
npm run start
```

You should see logs similar to:

```
[bridge] OSC UDP ready → 127.0.0.1:8000
[bridge] HTTP server listening on http://0.0.0.0:5173
[bridge] WS endpoint at ws://0.0.0.0:5173/ws
```

Open `http://127.0.0.1:5173` in the browser to load the installation.

## Environment Variables

Configure via `.env` or shell:

- `HTTP_PORT` (default `5173`) – HTTP server & WebSocket listener
- `WS_PATH` (default `/ws`) – WebSocket endpoint path
- `MODUL8_HOST` (default `127.0.0.1`)
- `MODUL8_PORT` (default `8000`)

## Testing from the Browser

With the page open, run in DevTools console:

```
const ws = new WebSocket('ws://127.0.0.1:5173/ws');
ws.onopen = () => {
  console.log('ws open');
  ws.send(JSON.stringify({ type: 'ping' }));
  ws.send(JSON.stringify({ type: 'osc', actions: [{ layer: 0, media: 8 }] }));
};
ws.onmessage = (event) => console.log('ws msg:', event.data);
```

Expected in Modul8 Script Output:

```
RECV ['/md8key/ctrl_layer_media/0', 'i', 8]
```

Layer 1 should switch to media ID 8. Multiple actions in a single message are sent sequentially.

## Development

Run with file watching:

```
npm run dev
```

The bridge logs concise events for connections, messages, and errors. Press `Ctrl+C` to shut down gracefully.
