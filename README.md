# Outpath

Outpath is a developer-focused API testing workspace with a secure local bridge.

## Request execution model

- **Public APIs** are executed by the FastAPI backend through the guarded `/api/requests/execute` endpoint. SSRF validation blocks localhost, private ranges, link-local addresses and metadata endpoints.
- **Local/private APIs** (`localhost`, `127.0.0.1`, `10.x`, `172.16-31.x`, `192.168.x`, selected IPv6 private/link-local ranges) are never proxied through the backend. The frontend detects them and uses the Outpath Local Bridge browser extension.
- When the extension is missing, the request workspace shows an install prompt instead of waiting for a timeout.
- If the extension is installed but a LAN origin needs optional host permission, the extension stores the pending origin and its popup provides the user-gesture permission button. Return to Outpath and send again after granting access.

## Local bridge development

1. Load the `extension/` directory as an unpacked Chrome/Chromium extension.
2. Run the frontend on `http://localhost:5173` or another origin listed in `extension/manifest.json`.
3. If a local LAN request needs permission, open the Outpath Bridge toolbar popup and click **Allow local access** for the pending origin.
4. For a production deployment, add the actual Outpath origin to `content_scripts.matches` and publish/update `VITE_EXTENSION_INSTALL_URL` in the frontend environment.

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


## Google sign-in

Google sign-in now uses Google Identity Services in React. There is no Google client secret or redirect URI in Outpath. Set only `VITE_GOOGLE_CLIENT_ID` in the frontend and set the same client ID as `google_client_id` in the FastAPI environment so the backend can verify the signed ID token and issue the existing Outpath session cookie. The backend does not need a Google client secret or OAuth redirect URI.

For the local bridge, set `VITE_BRIDGE_EXTENSION_ID=06612ea2ea284ec39bd19ef5fbf1523630e4fa972d2ffb459d598b845572b3d0` and use the direct Chrome Web Store URL configured in `VITE_EXTENSION_INSTALL_URL`.

## Google Sign-In (React popup)
Outpath uses Google Identity Services in explicit popup mode. Configure only `VITE_GOOGLE_CLIENT_ID` in the frontend and add the deployed frontend origin (for example `https://outpath.vercel.app`) under **Authorized JavaScript origins** in Google Cloud. Do not configure a redirect URI for this flow. The React callback receives the Google ID token and sends it to `/api/auth/google/verify` for session establishment.



## Deployment notes

- Render backend: Python 3.13.5 (`backend/.python-version`), `asyncpg` 0.31, and SQLAlchemy asyncio extras are pinned for deployment.
- Production browser sessions use secure `SameSite=None` cookies because the Vercel frontend and Render API are different sites. `credentials: include` is enabled on frontend API calls.
- Set `VITE_API_URL` on Vercel to the deployed FastAPI URL and `ALLOWED_ORIGINS` on Render to the exact Vercel origin as a JSON array.
- Google sign-in uses Google Identity Services popup mode in React. The backend only verifies the returned ID token and creates the existing session; no Google client secret or redirect URI is required for this flow.

## Auth deployment checklist (current fix)

The auth flow in this release is intentionally database-first:

- Google ID tokens are verified on FastAPI and the stable Google `sub` is the identity key.
- An already-linked Google identity signs into its existing Outpath user.
- A verified Google email can be linked to an existing Outpath email account instead of creating a duplicate.
- First-time Google users get a normal Outpath user plus an OAuth link in one idempotent transaction.
- Repeated Google callbacks/concurrent requests use PostgreSQL conflict-safe inserts and do not turn a successful login into a false 409.
- Email/password login returns the user directly instead of making a second `/api/auth/me` request.

### Render

Set these environment variables on the backend:

```text
DATABASE_URL=<your Neon PostgreSQL URL>
SECRET_KEY=<long random secret>
ENVIRONMENT=production
AUTO_MIGRATE=true
GOOGLE_CLIENT_ID=<the same Google Web Client ID used by Vercel>
ALLOWED_ORIGINS=["https://YOUR-VERCEL-DOMAIN"]
```

`GOOGLE_CLIENT_ID` must be the same Web application client ID used by the frontend.

### Vercel

Set:

```text
VITE_API_URL=https://outpath.onrender.com
VITE_GOOGLE_CLIENT_ID=<the same Google Web Client ID used by Render>
```

Because `VITE_*` values are baked into the frontend build, redeploy Vercel after changing them.

### Google Cloud Console

For the Web client ID, add the exact deployed frontend origin under **Authorized JavaScript origins**. For this React popup flow, do not add a redirect URI just for the popup credential callback. Google documents that the popup flow returns the ID token to the JavaScript callback and that `sub` should be used as the stable Google user identifier. 
