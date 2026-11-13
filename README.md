# bible-memory

Personal scripture memorization app. Static site (GitHub Pages) + Supabase.

- `index.html`, `css/`, `js/`: no build step; plain ES modules. `js/vendor/supabase.js` is supabase-js 2.45.4.
- `supabase/schema.sql`: database tables (one verse per row; `attempts.missed` stores missed word indexes for the heatmap).
- Login maps the username to `<username>@bible-memory.app` in Supabase Auth; the session persists so you sign in once per device.

Local preview: `python3 -m http.server` and open http://localhost:8000.
