# Support Ticket Dashboard

A lightweight Vue 3 + Vite + Tailwind dashboard for the support-ticket API. Not part of the graded tasks — built for the demo.

## Features

- **Ticket list** with live filters (category, priority, status) → `GET /tickets`
- **Create form** with an auto-classify toggle → `POST /tickets?auto_classify=true`
- **Detail view** — classification result, confidence bar, reasoning, keywords, decision log; manual override → `PUT /tickets/:id`; re-run auto-classify → `POST /tickets/:id/auto-classify`
- **Bulk import** (CSV / JSON / XML) with a live import summary → `POST /tickets/import`

## Prerequisites

The Express backend must be running on `http://localhost:3000`:

```bash
# from homework-2/
npm start
```

## Setup

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. The Vite dev server proxies `/api/*` → `http://localhost:3000` (see `vite.config.js`), so no CORS setup is needed on the backend.

## Configuration

The API base URL is configurable via env (`.env`):

```
VITE_API_BASE_URL=/api        # dev: uses the Vite proxy
# VITE_API_BASE_URL=https://api.example.com   # deployed backend
```

## Build

```bash
npm run build      # outputs to dist/
npm run preview    # serve the production build locally
```

## Structure

```
frontend/
├── index.html
├── vite.config.js          # dev proxy /api → :3000
├── tailwind.config.js
├── postcss.config.js
├── .env / .env.example     # VITE_API_BASE_URL
└── src/
    ├── main.js
    ├── App.vue             # layout + view orchestration
    ├── style.css           # Tailwind + component classes
    ├── constants.js        # enums + badge color maps + humanize()
    ├── composables/
    │   └── useTickets.js    # axios API layer (one method per endpoint)
    └── components/
        ├── BadgePill.vue        # colored category/priority/status badge
        ├── TicketFilters.vue    # filter bar
        ├── TicketList.vue       # list with confidence hint
        ├── CreateTicketForm.vue # create + auto-classify toggle
        ├── ImportPanel.vue      # file upload + summary
        └── TicketDetail.vue     # detail, classify, override, log
```
