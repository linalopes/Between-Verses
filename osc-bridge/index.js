import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import express from 'express';
import { WebSocketServer } from 'ws';
import osc from 'osc';

const HTTP_PORT = Number(process.env.HTTP_PORT) || 5173;
const WS_PATH = process.env.WS_PATH || '/ws';
const WS_PORT = HTTP_PORT; // WebSocket shares the HTTP server
const MODUL8_HOST = process.env.MODUL8_HOST || '127.0.0.1';
const MODUL8_PORT = Number(process.env.MODUL8_PORT) || 8000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '..');

const app = express();
app.use(express.static(WEB_ROOT, { extensions: ['html'] }));
app.get('*', (req, res) => {
  res.sendFile(path.join(WEB_ROOT, 'index.html'));
});

const server = http.createServer(app);

const clients = new Set();

const udpPort = new osc.UDPPort({
  localAddress: '0.0.0.0',
  localPort: 0,
  remoteAddress: MODUL8_HOST,
  remotePort: MODUL8_PORT
});

function log(message, extra) {
  if (extra !== undefined) {
    console.log(`[bridge] ${message}`, extra);
  } else {
    console.log(`[bridge] ${message}`);
  }
}

function sendOscMessage(layer, media) {
  const address = `/md8key/ctrl_layer_media/${layer}`;
  udpPort.send(
    {
      address,
      args: [
        {
          type: 'i',
          value: media
        }
      ]
    },
    MODUL8_HOST,
    MODUL8_PORT
  );
  log(`OSC sent ${address} ${media}`);
}

function safeJsonParse(data) {
  try {
    return { ok: true, value: JSON.parse(data) };
  } catch (err) {
    return { ok: false, err };
  }
}

function handleMessage(ws, raw) {
  const parsed = safeJsonParse(raw);
  if (!parsed.ok) {
    log('Invalid JSON received', parsed.err?.message);
    ws.send(JSON.stringify({ type: 'error', reason: 'invalid_json' }));
    return;
  }

  const msg = parsed.value;
  if (!msg || typeof msg !== 'object') {
    ws.send(JSON.stringify({ type: 'error', reason: 'unsupported_message' }));
    return;
  }

  switch (msg.type) {
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong' }));
      log('Ping received -> pong sent');
      return;
    case 'osc': {
      const actions = Array.isArray(msg.actions) ? msg.actions : [];
      let count = 0;
      for (const action of actions) {
        const { layer, media } = action ?? {};
        if (
          typeof layer === 'number' &&
          Number.isInteger(layer) &&
          typeof media === 'number' &&
          Number.isInteger(media)
        ) {
          sendOscMessage(layer, media);
          count += 1;
        }
      }
      ws.send(JSON.stringify({ type: 'sent', count }));
      log('OSC actions processed', { requested: actions.length, sent: count });
      return;
    }
    default:
      ws.send(JSON.stringify({ type: 'error', reason: 'unsupported_message' }));
      log('Unsupported message type', msg.type);
  }
}

function onConnection(ws) {
  clients.add(ws);
  log(`WS connected (${clients.size} clients)`);
  ws.send(JSON.stringify({ type: 'hello', wsPort: WS_PORT, wsPath: WS_PATH }));

  ws.on('message', (data) => {
    handleMessage(ws, data.toString());
  });

  ws.on('close', () => {
    clients.delete(ws);
    log(`WS disconnected (${clients.size} clients)`);
  });

  ws.on('error', (err) => {
    log('WS client error', err.message);
  });
}

udpPort.on('ready', () => {
  log(`OSC UDP ready → ${MODUL8_HOST}:${MODUL8_PORT}`);
});
udpPort.on('error', (err) => {
  log('OSC error', err.message);
});
udpPort.open();

const wss = new WebSocketServer({ server, path: WS_PATH });
wss.on('connection', onConnection);
wss.on('error', (err) => {
  log('WS server error', err.message);
});

server.listen(HTTP_PORT, () => {
  log(`HTTP server listening on http://0.0.0.0:${HTTP_PORT}`);
  log(`WS endpoint at ws://0.0.0.0:${HTTP_PORT}${WS_PATH}`);
});

server.on('error', (err) => {
  log('HTTP server error', err.message);
});

process.on('SIGINT', () => {
  log('Shutting down...');
  for (const ws of clients) {
    try {
      ws.close(1001, 'server_shutdown');
    } catch (err) {
      log('Error closing WS client', err?.message);
    }
  }
  wss.close(() => {
    log('WS server closed');
    udpPort.close();
    log('OSC port closed');
    server.close(() => {
      log('HTTP server closed');
      process.exit(0);
    });
  });
  setTimeout(() => process.exit(0), 2000).unref();
});
