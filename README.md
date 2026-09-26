# Outpath

Outpath is a web-first API testing workspace. Normal requests execute through the hosted FastAPI backend; local/private requests execute **directly from the browser** using Chrome/Chromium Local Network Access (LNA).

## Local API testing

There is no Chrome extension, Web Store setup, Cloudflare Tunnel setup, or local installer in this build.

Flow:

```text
https://outpath.vercel.app
        │
        │ browser fetch + Local Network Access permission
        ▼
http://127.0.0.1:8000
        │
        ▼
local/private API
```

The browser request uses Fetch `targetAddressSpace` (`loopback` for localhost/127.0.0.1 and `local` for private/LAN targets). Chrome's LNA permission is controlled by the browser; the page must be served from a secure context such as HTTPS.

### Target API CORS

A local API must allow the Outpath page origin. For the deployed app:

```text
https://outpath.vercel.app
```

For local development also allow:

```text
http://localhost:5173
http://127.0.0.1:5173
```

FastAPI example:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://outpath.vercel.app",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

If the target API does not send CORS headers, the browser will block the response even when LNA permission is granted. That is a browser security rule; this web-only build intentionally does not bypass it.

## Backend CORS

The Outpath FastAPI backend is already configured for the deployed Outpath origin and local Vite development. Set `ALLOWED_ORIGINS` in Render to the exact frontend origins you use, for example:

```env
ALLOWED_ORIGINS=["https://outpath.vercel.app","http://localhost:5173"]
```

## Quick local LNA test

This repo includes a tiny FastAPI target with the required CORS headers. Start it in a second terminal:

```powershell
cd examples\local-api
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000
```

Then in Outpath use:

```text
GET http://127.0.0.1:8000/api/test
POST http://127.0.0.1:8000/api/echo
```

For the POST body:

```json
{
  "name": "Outpath",
  "value": 100
}
```

On a supported Chrome build, the first private/LAN request can trigger the Local Network Access permission prompt. Allow it and send again if the browser asks. Chrome launched the LNA permission in stable with Chrome 142; the request must come from a secure context.

## Local development

Backend:

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

Open the Vite app at `http://localhost:5173`.

## Production

The Vercel app uses the `/api/*` rewrite to the Render backend. Google authentication remains on the existing OAuth/session flow.

## Local API testing (Chrome 145+)

Outpath uses browser Local Network Access for local/private requests. For `localhost`/`127.0.0.1`, Chrome 145+ may show the **Apps on device** permission; for private LAN targets such as `192.168.x.x`, it uses **Local Network**. The deployed site must be HTTPS. The target API must allow the Outpath origin through CORS and, when Chrome sends `Access-Control-Request-Private-Network: true`, return `Access-Control-Allow-Private-Network: true`.

If Chrome has already blocked the permission, open the site information icon → **Site settings** and allow the applicable local-device/network permission, then reload Outpath.
