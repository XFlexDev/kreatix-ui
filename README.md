# Kreatix UI

A permanently free, open-source community for UI components, libraries, and their creators.

Live: https://ui.kreatix.dev

## Nothing paid. Ever.

The platform, every feature, and the full advertised functionality of every listing are free and open-source. No Pro tiers, paid promotion, paid dependencies, or paywalled components. Listings require a public source repository and an open-source license, and go through human review before discovery.

## GitHub sign-in

Create a GitHub OAuth App with homepage `https://ui.kreatix.dev` and callback `https://ui.kreatix.dev/api/auth/github/callback`. Device flow is not used. Set server-only `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`; without both, GitHub sign-in is hidden and disabled. Local development uses the configured `APP_ORIGIN` for its callback.

Only `read:user` is requested. OAuth uses PKCE, expiring single-use state bound to an HttpOnly cookie, and the immutable GitHub user ID. Access tokens are not stored. A matching username never automatically links an existing account: sign in normally and use **Settings → Connect GitHub** to link it explicitly. GitHub-only accounts sign in through GitHub rather than a password.

## First release

- Public discovery, search, filters, libraries, creator profiles, and a feed for new makers.
- Username/password accounts, saves, follows, comments, and reports.
- HTML/CSS/JS and React/Motion previews in isolated, network-disabled iframes.
- Paste code or import a single local code file; live preview updates while typing.
- Private drafts, submission review, revisions, creator workspace, and account settings.
- Moderator queue with license/free-only checks, attribution, reports, and audit history.
- Logical shared-stage morphs, reduced-motion support, and touch-safe controls.

React previews support `react`, `react/jsx-runtime`, `react-dom/client`, and `motion/react`. Define a named `App` component. Other frameworks can use public HTTPS demo links. Arbitrary package installation and multi-file GitHub imports are not part of this release. Email recovery is not available; keep your password safe.

Curated launch picks are from Fancy Components by Daniel Petho. They were not submitted or endorsed by the maintainer. See [third-party notices](THIRD_PARTY_NOTICES.md).

## Development

Requires Node 24+.

```sh
npm ci
npm run dev
```

Vite runs on port 5173 and proxies `/api` to the backend on 8462. SQLite data lives in `./data`; it is never committed. Environment variables are documented in `.env.example`; set overrides in your shell. The dev command does not automatically load an `.env` file.

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

## Production

`npm run build` creates `dist/` and compiled server/maintenance commands in `build/`. Install runtime dependencies with `npm ci --omit=dev`, then use `npm start` with `NODE_ENV=production`, an HTTPS `APP_ORIGIN`, and a writable `DATA_DIR`. The server binds to loopback by default.

The first deployment runs as the isolated `kreatix-ui` systemd service on `127.0.0.1:8473`, with state under `/var/lib/kreatix-ui`. The dedicated Caddy host is `ui.kreatix.dev`; existing root services and DNS remain unchanged. `scripts/deploy-first.sh` is first-install-only, reserves that port, validates Caddy before reload, and backs up its config.

During development, publish successful builds while editing:

```sh
node scripts/live-deploy.mjs user@host /opt/kreatix-ui /path/to/ssh-key
```

The watcher uploads hashed assets before the entry HTML and keeps older assets available. It restarts the service only for backend changes. Production pages check `/api/version` every five seconds and refresh for newer builds, except while editing inputs or on the publisher. A development server is never exposed publicly.

Register an account before granting moderator access:

```sh
DATA_DIR=/var/lib/kreatix-ui node build/admin.js username
DATA_DIR=/var/lib/kreatix-ui node build/backup.js /existing/backup/directory/community.sqlite
```

Use a trusted server shell with database permissions. Backups use SQLite's consistent backup API, not a live file copy. `TRUST_PROXY=1` requires a reverse proxy that sanitizes client IP headers. Production session cookies are secure, HTTP-only, and same-site; mutation requests verify origin and the application header.

## License

The platform is AGPL-3.0-or-later. Listed projects and adapted examples retain their own licenses. The permanent free-only platform policy is separate from the license rights granted to downstream users.
