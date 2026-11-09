# Security Review

Date: 2026-11-09 · Scope: whole repo (`backend/`, `frontend/pantry/`, config, git history, build output, dependencies).
Method: manual code review, `git log -p` secret scan, scan of `dist/` bundle, `npm audit --omit=dev`. No live testing was done.
Secret values are deliberately **not** reproduced here.

## 1. Summary

| # | Severity | Finding |
|---|----------|---------|
| 1 | High | Groq key is stored in `localStorage`; any XSS or malicious dependency can read it |
| 2 | High | Production dependency `axios` 1.12.2 has known high-severity advisories (plus 5 transitive highs) |
| 3 | High | Legacy FastAPI backend is unauthenticated, has no rate limits, binds `0.0.0.0` and spends the owner's Groq/Roboflow quota |
| 4 | Medium | Real `GROQ_API_KEY` sits in `frontend/pantry/.env`, the wrong place for a key that no frontend code reads |
| 5 | Medium | No CSP or other security headers; no `vercel.json` |
| 6 | Medium | Roboflow publishable key is shipped in the bundle, so it is only safe if restricted in Roboflow |
| 7 | Medium | User video frames go to third parties (Groq) with no consent notice |
| 8 | Low | `youtubeId` from a third-party API goes into an iframe `src` unvalidated |
| 9 | Low | LLM output is trusted without schema validation; prompt injection via image text |
| 10 | Low | Backend: `allow_headers=["*"]`, ffmpeg on untrusted input, `/recipes` has no per-item length cap |
| 11 | Info | Third-party requests (Google Fonts, TheMealDB, Wikipedia, YouTube) leak IP/usage |

Good practices already in place: `.env` is gitignored and **never committed** (no `gsk_`/`rf_` secrets found in any commit); `dist/` contains only the public `rf_` publishable key, no Groq key; the Groq key input is `type="password"`; React renders LLM text as text (no `dangerouslySetInnerHTML`/`innerHTML`/`eval` anywhere); the YouTube embed uses `youtube-nocookie.com`; external links use `rel="noreferrer"`; the backend ignores client filenames, caps upload size and validates content-type.

## 2. Groq key: storage and management

### How it works today
- **Bring-your-own-key.** The user pastes their own Groq key into the UI (`VideoUpload.tsx:190-196`). It is saved with `localStorage.setItem('groq_api_key', …)` (`lib/groq.ts:3-19`) and sent directly from the browser to `api.groq.com` as `Authorization: Bearer …` (`lib/groq.ts:26,54`). No server holds the key.
- **Dev `.env`.** `frontend/pantry/.env` also holds a `GROQ_API_KEY` (no `VITE_` prefix). Vite does not expose it to the bundle and nothing reads it. I confirmed it is absent from `dist/`.

### Findings
**1. localStorage is readable by any script on the origin (High).** The key persists indefinitely, unencrypted. One XSS bug, a compromised npm package (`inferencejs`, `axios` and ~260 transitive packages run in this origin) or a malicious browser extension can exfiltrate it. There is no CSP to limit this (finding 5). A stolen key lets an attacker run up the user's Groq quota/bill and read their usage.

**4. Stray real key in the frontend folder (Medium).** It is gitignored and not leaked today, but:
- one rename to `VITE_GROQ_API_KEY` (an easy mistake, since the Roboflow var next to it has that prefix) would embed it in the public JS bundle;
- `.env.example` documents `GROQ_API_KEY` for the frontend, which invites this mistake;
- the backend that would use it calls `load_dotenv()` from its own working directory, so the file is probably dead.

**Key sent to the model-list endpoint on every session (Low).** `listModels` sends the key to `/models` just to pick a model. This is fine over TLS, but it is another place the key travels. The cache is in-memory and keyed by the raw key (`modelCache`); harmless but unnecessary.

**No validation or hygiene on the key (Low).** Any string is accepted, and there is no `gsk_` prefix check or expiry. Errors never echo the key (good).

### Fixes
1. **Prefer session-scoped storage.** Use `sessionStorage`, or keep the key in memory only, with an opt-in "Remember on this device" checkbox. This cuts exposure to the current tab.
2. **Best fix for a public deployment: proxy the call.** Put the Groq key in a server-side secret (Vercel env var, *not* `VITE_`-prefixed) and add a small serverless function, e.g. `api/groq.ts`, that forwards `chat/completions` with the server key. Then the browser never holds a key. Pair it with the rate limiting and abuse controls in section 3 (a shared key is worth stealing).
3. **If you stay BYO-key**, tell users to create a dedicated, spend-capped Groq key, and say so in the UI copy ("stored unencrypted in this browser").
4. **Add a CSP** (finding 5) so an injected script cannot load or exfiltrate. Add `Subresource Integrity` or self-host the font CSS.
5. **Delete `GROQ_API_KEY` from `frontend/pantry/.env` and `.env.example`.** Keep backend secrets in `backend/.env` (with a `backend/.env.example`). If the key in that file was ever shared, pasted in a chat or screenshot, **rotate it** in the Groq console. Treat the file as exposed if it was.
6. **Prevent regressions.** Add a pre-commit/CI secret scan (`gitleaks` or GitHub secret scanning with push protection). Add an ESLint/CI check that fails if any `VITE_*` variable name contains `SECRET`, `GROQ` or `PRIVATE`.
7. Validate the key shape (`/^gsk_[A-Za-z0-9]{20,}$/`) before saving, and mask it in any UI that ever displays it.

## 3. Data transfer map

```
User's video file
  └─ Browser only: <video>+canvas → ≤8 JPEG frames (≤640px)               [stays local]
        ├─ Roboflow inferencejs worker (model downloaded, inference local)   → Roboflow: model download + publishable key
        └─ (if Groq key) 2x2 collage JPEG, base64 ──TLS──▶ api.groq.com       ← frames leave the device
Ingredient names ──TLS──▶ api.groq.com (recipe prompt, streamed back)
Recipe name/dish ──TLS──▶ themealdb.com, youtube.com/oembed, wikipedia.org (query strings)
Page load ──▶ fonts.googleapis.com / fonts.gstatic.com
Recipe iframe/img ──▶ youtube-nocookie.com, TheMealDB / Wikimedia image hosts
```
There is **no first-party server in the production path**. `axios` is still a dependency but unused in `src/`. The old FastAPI backend is not called by the frontend. The Vite `/api` proxy only exists in dev.

### Findings
- All transfers are HTTPS; no mixed content found. No cookies or auth sessions exist, so CSRF is not applicable.
- **7. Privacy (Medium).** Pantry/fridge video frames (which can incidentally show people, mail, screens, room interior) are sent to Groq with no notice or consent. Detection also falls back silently to local mode on Groq failure, which is good, but the user is never told what leaves the device.
- **11. Third-party leakage (Info).** Each recipe triggers requests to TheMealDB, YouTube and Wikipedia carrying recipe names plus the user's IP. Google Fonts leaks IP/UA on every load.
- **6. Roboflow publishable key (Medium).** `VITE_ROBOFLOW_PUBLISHABLE_KEY` is in the public bundle (`rf_vjQO…`). That is by design for publishable keys, but anyone can copy it to download your model and use your Roboflow quota. Mitigate in the Roboflow dashboard: restrict to your production domain(s) and keep it **publishable only**; never put a private Roboflow API key in a `VITE_` var.
- Local video is read via `URL.createObjectURL`; it is revoked/handled client-side, never uploaded in this path.

### Fixes
- Add a one-line consent/notice next to the Groq key: "Video frames are sent to Groq to identify ingredients."
- Gate third-party media lookups behind the recipe view only (already the case) and consider proxying/caching them.
- Self-host fonts (`@fontsource`) to remove the Google dependency and simplify the CSP.
- Document the data flow in the README (the map above can be copied).

## 4. Frontend application security

**5. No CSP or security headers (Medium).** There is no `vercel.json`, no `<meta http-equiv>` CSP. Suggested `frontend/pantry/vercel.json`:
```json
{
  "headers": [{
    "source": "/(.*)",
    "headers": [
      { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob: https://www.themealdb.com https://*.wikimedia.org; media-src blob:; frame-src https://www.youtube-nocookie.com; connect-src 'self' https://api.groq.com https://api.roboflow.com https://*.roboflow.com https://www.themealdb.com https://www.youtube.com https://en.wikipedia.org; frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
      { "key": "X-Content-Type-Options", "value": "nosniff" },
      { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
      { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
      { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains" }
    ]
  }]
}
```
Test in report-only mode first (`Content-Security-Policy-Report-Only`): inferencejs/TF.js may need extra `connect-src`/`script-src` entries.

**8. Unvalidated YouTube ID (Low).** `media.ts:20` takes `v=` from a TheMealDB URL; `RecipeCard.tsx:22` puts it into an iframe `src`. A bad value could alter the embed path/query. Fix: only accept `/^[\w-]{11}$/`, and add `sandbox="allow-scripts allow-same-origin allow-presentation"` and `referrerpolicy` to the iframe. Likewise only use `imageUrl` if its host is on an allow-list.

**9. Untrusted model output (Low).** `parseJson` casts to `Recipe[]` without checks. A malformed or injected reply (e.g. text on a pantry label saying "ignore instructions…") can crash rendering (`steps.map` on a non-array) or produce unsafe/misleading content. Rendering is XSS-safe, but add runtime schema validation (zod/valibot): strings only, length caps, array caps. Cap ingredient names (≤40 chars, ≤50 items) before building the prompt, and strip control characters. Treat dietary/allergy output as advisory.

**Uploads (Low).** Only `file.type.startsWith('video/')` is checked client-side, and there is no size/duration cap in the browser path; a huge file can exhaust memory/tab. Add a size limit (e.g. 200 MB) and duration limit.

## 5. Legacy backend (`backend/main.py`)

Not used by the current frontend but still deployable.

- **3. Unauthenticated, spends your quota (High if ever deployed).** `/upload` and `/recipes` need no auth or rate limit, and use `GROQ_API_KEY`/`ROBOFLOW_API_KEY` from the server environment. Anyone who finds the URL can drain them. `uvicorn.run(host="0.0.0.0")` exposes it on every interface.
- CORS: `allow_headers=["*"]` is broader than necessary, and `ALLOWED_ORIGINS` is split without stripping whitespace/validation. Default is localhost only (good).
- **ffmpeg on untrusted input (Low/Med).** A crafted media file is a classic attack surface. Mitigations: pin and update ffmpeg, run as an unprivileged user in a container with CPU/memory/time limits (`.run()` has no timeout), and restrict protocols (`-protocol_whitelist file`). The 50 MB / 30 s / 15 frame caps are good, but content-type is client-supplied, so also sniff magic bytes.
- `/recipes`: list capped at 50 items but items have no length limit; an attacker can send huge strings and run up tokens. Cap each at ~60 chars.
- Verbose error handling is already generic (`HTTPException(500, "...")`). Keep it that way; logs may contain exception details, so keep them off public sinks.

**Fix options:** (a) **delete the backend** if the client-side architecture is the future (simplest, removes the whole attack surface and the unused deps `roboflow`, `groq`, `ffmpeg-python`, `axios`); or (b) if kept, add an API key or auth, per-IP rate limiting (`slowapi`), bind to `127.0.0.1` behind a reverse proxy, strict CORS (`allow_headers=["Content-Type"]`), request timeouts, and a Docker `USER` + resource limits.

## 6. Dependencies

`npm audit --omit=dev` reports **7 vulnerabilities (1 low, 1 moderate, 5 high)**:
- `axios` ^1.12.2 (**direct**, high): upgrade to the latest 1.x, or remove it, since `src/` doesn't import it.
- transitive: `form-data`, `follow-redirects`, `minimatch`, `brace-expansion`, `picomatch` (ReDoS / method injection, mostly dev-tool reachable), `@babel/core` (low).

Actions: `npm uninstall axios` (or update), run `npm audit fix`, re-run the audit, commit the lockfile. Enable Dependabot/Renovate and `npm audit --omit=dev --audit-level=high` in CI. Python `requirements.txt` is entirely unpinned: pin versions (`pip-compile --generate-hashes`) and run `pip-audit`.
Also note the build uses `vite: npm:rolldown-vite@7.1.12`, an unusual override. Keep it patched and prefer official Vite unless needed.

## 7. Repository hygiene

- `.gitignore` covers `.env`, `dist`, `.vercel` (verified with `git check-ignore`). Only `.env.example` is tracked (empty values).
- `frontend/pantry/.vercel/project.json` (project/org IDs) is ignored; those IDs aren't secrets but keep them out of the repo.
- Add `SECURITY.md` disclosure contact (or repo-level `.github/SECURITY.md`) and enable GitHub secret scanning + push protection.

## 8. Prioritised action list

1. **Today:** `npm uninstall axios && npm audit fix`; remove `GROQ_API_KEY` from `frontend/pantry/.env`/`.env.example`; rotate the Groq key if that file was ever shared; restrict the Roboflow key to your domain.
2. **This week:** add `vercel.json` headers + CSP (report-only first); move the Groq key to `sessionStorage` with opt-in persistence; add a data-sharing notice; validate `youtubeId` and LLM JSON with a schema; sandbox the iframe.
3. **Decide:** BYO-key in browser (current) vs. a serverless Groq proxy (recommended for a public launch, needs rate limiting). Delete or harden `backend/`.
4. **Ongoing:** secret scanning in CI, Dependabot, pinned Python deps, self-hosted fonts.
