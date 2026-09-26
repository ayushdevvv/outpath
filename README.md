# Outbox

Outbox is a developer-focused API testing workspace with a secure local bridge.

## Request execution model

- **Public APIs** are executed by the FastAPI backend through the guarded `/api/requests/execute` endpoint. SSRF validation blocks localhost, private ranges, link-local addresses and metadata endpoints.
- **Local/private APIs** (`localhost`, `127.0.0.1`, `10.x`, `172.16-31.x`, `192.168.x`, selected IPv6 private/link-local ranges) are never proxied through the backend. The frontend detects them and uses the Outbox Local Bridge browser extension.
- When the extension is missing, the request workspace shows an install prompt instead of waiting for a timeout.
- If the extension is installed but a LAN origin needs optional host permission, the extension stores the pending origin and its popup provides the user-gesture permission button. Return to Outbox and send again after granting access.

## Local bridge development

1. Load the `extension/` directory as an unpacked Chrome/Chromium extension.
2. Run the frontend on `http://localhost:5173` or another origin listed in `extension/manifest.json`.
3. If a local LAN request needs permission, open the Outbox Bridge toolbar popup and click **Allow local access** for the pending origin.
4. For a production deployment, add the actual Outbox origin to `content_scripts.matches` and publish/update `VITE_EXTENSION_INSTALL_URL` in the frontend environment.

## Environment

Frontend:

```env
VITE_API_URL=http://localhost:8000
VITE_EXTENSION_INSTALL_URL=https://chromewebstore.google.com/
```

Backend:

```env
DATABASE_URL=postgresql+asyncpg://...
SECRET_KEY=...
ALLOWED_ORIGINS=["http://localhost:5173"]
```

Keep real secrets out of source control.
