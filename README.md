# Smart Waste Monitoring System

A full stack project that shows overflowing dustbins on a live map, lets nearby
citizens file a complaint against a specific bin, and gives the municipality
an admin-only dashboard to manage complaints and track the collection vehicle
live as it drives to the bin.

## Tech stack

- **Backend:** Plain Node.js (`http` module only — no npm install required)
- **Database:** a JSON file (`data/db.json`) acting as a simple database — swap
  the `readDB()` / `writeDB()` functions in `server.js` for MongoDB/MySQL later
  if you need a real database for submission
- **Frontend:** HTML, CSS, vanilla JavaScript
- **Map:** Leaflet.js + OpenStreetMap tiles (free, no API key needed)

## How to run it

You only need [Node.js](https://nodejs.org) installed (v14 or newer). No `npm install` is needed —
the server only uses Node's built-in modules.

```bash
cd smart-waste
node server.js
```

Then open **http://localhost:5000** in your browser.

## Pages

| Page | URL | Who can access |
|---|---|---|
| Public map + complaint form | `/` (index.html) | Everyone |
| Admin dashboard | `/admin.html` | Login required |

**Admin login:** `username: vinu` / `password: vinu@123`

## Features

1. **Live bin map — Tamil Nadu wide** — every dustbin is shown as a marker on
   the map, with sample bins in Thiruthuraipoondi, Thanjavur, Velankanni,
   Trichy, Chennai and Madurai.
   - 🟢 Green = normal (fill level below 60%)
   - 🟡 Gold = filling up (60–85%)
   - 🔴 Red = overflow / danger (85%+)
   The homepage polls `GET /api/dustbins` every 8 seconds so the map behaves
   like a live sensor feed.
2. **Type any Tamil Nadu place name to jump there** — the search bar above
   the map (and the "Locate" button in the admin's "Add a New Dustbin" form)
   geocodes what you type using the free OpenStreetMap Nominatim API,
   restricted to Tamil Nadu's bounding box, so typing e.g.
   "Thiruthuraipoondi" pans the map straight to it. This needs the visitor's
   browser to have internet access (it calls `nominatim.openstreetmap.org`
   directly from the page — no backend change needed).
3. **Citizen complaint — always reachable** — a "Report a Problem" button
   sits in the header and the hero section, so filing a complaint never
   depends on successfully clicking a tiny map marker. It opens a form with
   a dropdown to pick the bin (also pre-filled if you click "Report this
   bin" inside a marker's popup), plus name, phone and description. This
   posts to `POST /api/complaints`, no login needed, so anyone can report an
   overflowing bin.
4. **Admin-only complaints list** — `GET /api/complaints` requires the admin
   token, so only the municipality can see who reported what. The dashboard
   lets the admin dispatch a team and mark a complaint as collected
   (`PUT /api/complaints/:id/status`), which also resets that bin's fill level.
5. **Live vehicle tracking** — clicking "Track Live Location" on a complaint
   opens a small map showing the collection vehicle moving from the depot to
   the bin, polling `GET /api/tracking/:complaintId` every 2 seconds — the
   same pattern food-delivery/ride-hailing apps use for live tracking.
   Right now the position is *simulated* (interpolated over 60 seconds) so
   the demo works without any hardware. To use **real GPS**, have the
   collection team's phone (a small app, or even just a browser tab using
   `navigator.geolocation.watchPosition`) `POST` its live `{lat, lng}` to a
   new endpoint every few seconds, and have `GET /api/tracking/:id` return the
   latest reported position instead of the interpolated one.
6. **Admin can add new bins anywhere in Tamil Nadu** — the "Add a New
   Dustbin" form on the dashboard uses the same place-name search: type a
   town, click "Locate" to confirm it on the mini-map, then save — it's
   immediately added to the public map via `POST /api/dustbins`.
7. **Dark / Light theme toggle** (sun/moon icon, top right):
   - Dark theme: black background, gold accent, white text
   - Light theme: white background, gold accent, black text
   The choice is remembered in the browser (`localStorage`).
8. **7-step process strip** on the homepage, matching the workflow: citizen
   reports → complaint sent to system → admin views it → admin checks the
   bin's location → collection is performed → status is updated → dashboard
   reflects the update.

## Connecting real hardware later

Right now `fillLevel` is stored in `data/db.json` and updated with:

```
POST /api/dustbins/:id/fill
Body: { "fillLevel": 92 }
```

An ultrasonic sensor + microcontroller (e.g. Arduino/ESP32) sitting inside
each real bin can call this endpoint over Wi‑Fi whenever it takes a reading —
no other code needs to change, since the map and dashboard just read whatever
is in the database.

## Project structure

```
smart-waste/
├── server.js              # backend (routes + JSON "database")
├── package.json
├── data/
│   └── db.json             # dustbins + complaints (auto-updated by the app)
└── public/
    ├── index.html           # public homepage: map + complaint form
    ├── admin.html            # admin login + dashboard
    ├── css/style.css          # dark/light theme
    └── js/
        ├── theme.js            # dark/light toggle
        ├── app.js              # public homepage logic
        └── admin.js             # dashboard + live tracking logic
```

## Notes for your project report

- The admin auth here uses a single fixed demo token for simplicity, which is
  fine for a college project demo but **not secure for a real deployment** —
  for a production system you'd want hashed passwords and per-session JWTs.
- The location search calls the free OpenStreetMap Nominatim API from the
  browser, so it needs internet access on the machine viewing the page (the
  Node server itself has no external dependency). Nominatim's usage policy
  allows light/demo use like this; for heavy production traffic you'd run
  your own geocoding server or use a paid provider.
- Sample bins are spread across a few Tamil Nadu towns (Thiruthuraipoondi,
  Thanjavur, Velankanni, Trichy, Chennai, Madurai) as examples; add your own
  real locations from the admin dashboard's "Add a New Dustbin" form, or by
  editing `data/db.json` directly.
