# WRH Coordination Platform – Frontend

Next.js/Turbopack client for the WRH coordination suite. It delivers:

- Firebase-authenticated channel chat with participants management.
- One-to-one WebRTC calls (Safari/Chrome hardened).
- Optional live captions powered by the STT server (remote audio streaming + summaries).
- Round-trip latency indicator for the signaling WebSocket.

## Live Demo

Production instance: https://wrh-coord-platform.web.app/

## Getting Started

```bash
npm install
npm run dev
```

Visit `http://localhost:3000` and create a channel (or join an existing one).  
To enable captions, set `NEXT_PUBLIC_STT_WS_URL` to the FastAPI server’s `/ws-stt` endpoint; otherwise the CC toggle stays off.

## Related Repositories

- [wcp-chat-server](https://github.com/eliaskanakis/wcp-chat-server) – Node.js WebSocket & Firebase bridge.
- [wcp-stt-server](https://github.com/eliaskanakis/wcp-stt-server) – FastAPI STT mock that receives audio chunks.

## Demo Video

🎬 [Watch the walkthrough on YouTube](https://www.youtube.com/watch?v=nZzlvX0EO1A).

## Deployment

The project publishes through Firebase Hosting (`firebase deploy`) using the production build:

```bash
npm run build
npm run start   # optional local preview
```

Ensure the chat server and STT server URLs are set via `NEXT_PUBLIC_WS_URL` and `NEXT_PUBLIC_STT_WS_URL` before deploying.
