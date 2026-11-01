# Site Permit Register

Work-permit register for AGC sites: PIN sign-in, company accounts approved by AGC, site map by area,
serial numbers generated before the permit photo is uploaded, cancel (never delete).

- `worker.js` – Cloudflare Worker (API). D1 database binding `DB`, static files in `public/`.
- `schema.sql` – database tables.
- `android/` – Android app (WebView wrapper). GitHub Actions builds `apk/PermitRegister.apk`.

Deploy: Cloudflare dashboard → Workers & Pages → Create → Import a repository → this repo, root directory `permit`.
