# Remez UI (Vite + React + TS + Tailwind)

## Local dev
```bash
npm install
cp .env.example .env
npm run dev
```

Set `VITE_API_BASE_URL` in `.env` to point at your backend (default in example: `http://localhost:8000`).

This UI calls:
- `POST {VITE_API_BASE_URL}/api/analyze`

## Docker (static build + nginx)
Build:
```bash
docker build -t remez-ui:latest .
```

Run:
```bash
docker run --rm -p 8080:80 remez-ui:latest
```

Then open:
- http://localhost:8080

### Notes on API / CORS
By default the UI uses `VITE_API_BASE_URL` at build time.

If you want nginx to proxy `/api/*` to your backend (avoids CORS), you can:
1. Uncomment the `/api/` block in `nginx/default.conf`
2. Add an upstream env var and use a templating approach (or bake the upstream into the conf).

If you tell me your docker-compose layout (frontend + backend service names/ports), I can generate a clean compose + nginx proxy setup.
