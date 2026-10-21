# Shared Shopping List

My girlfriend and I kept forgetting things when shopping. I wanted a list we both keep up to date, one that updates live
while one of us is in the store. It had to work on iPhone and Android, and I didn't want to pay for an app or put up
with an ad-riddled one. So I built my own, a browser-based PWA.

## Features

- One general list, plus optional lists per store
- Live updates between devices, offline edits sync once you're back online
- History of what was bought, with one tap to put it back on the list
- Autocomplete from everything you've added before
- Push notifications when someone adds items (collected for 90 s into one) or goes shopping
- Installable web app (PWA) for iOS, Android and desktop, works offline in the store
- Self-hosted as a single Docker container, for any number of people
- UI in German for now

**Stack:** Bun, Hono, SQLite · Preact, Vite, Tailwind · Server-Sent Events · IndexedDB + service worker

## Requirements

- **Running it:** a Docker host (e.g. Unraid), plus a reverse proxy with HTTPS in front of it (nginx, Caddy, Traefik, …).
  Phones only run the service worker, and with it offline mode and install, on HTTPS.
- **Developing:** [Bun](https://bun.sh) 1.4 or newer.
- **Devices:** a current browser. On iOS, add it to the home screen from Safari.

## Development

```sh
bun install
cp .env.example .env      # set USERS
bun run dev:server        # API on :3000
bun run dev:client        # app on http://localhost:5173, proxies /api
```

```sh
bun test
bun run typecheck
```

## Configuration

| Variable     | Default             | Description                                                   |
| ------------ | ------------------- | ------------------------------------------------------------- |
| `USERS`      | –                   | `Name:key` pairs, comma-separated. The key is the login.      |
| `PORT`       | `3000`              | HTTP port                                                     |
| `DB_PATH`    | `./data/db.sqlite`  | SQLite database, `-wal`/`-shm` files go next to it            |
| `CLIENT_DIR` | `./dist`            | Built client (`bun run build`), served next to the API        |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | – | Push notification keys. Leave all three `VAPID_*` out to turn push off. |
| `VAPID_SUBJECT` | – | Contact for the push services, `mailto:you@example.com`   |

Generate keys with `bun -e 'console.log(crypto.randomUUID())'`, VAPID keys with `bunx web-push generate-vapid-keys`.
Generate the VAPID keys once and keep them: new ones break every device's subscription, and everyone has to turn
notifications on again. Push needs HTTPS, and on iOS the app installed to the home screen.

## Deployment

Every push to `master` builds `ghcr.io/cupcaker/shared-shopping-list:latest`.

```sh
docker run -d -p 3000:3000 -v /mnt/user/appdata/shopping-list:/data \
  -e USERS="Tom:<key>,Partner:<key>" \
  -e VAPID_PUBLIC_KEY=<public> -e VAPID_PRIVATE_KEY=<private> -e VAPID_SUBJECT=mailto:<you> \
  ghcr.io/cupcaker/shared-shopping-list:latest
```

Behind nginx, turn off buffering for the event stream:

```nginx
location /api/events {
    proxy_pass http://unraid-host:3000;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_read_timeout 1h;
}
```

## Todo

- [ ] Translations: English next to German, picked by the browser language (UI text, date formats, default list name)
