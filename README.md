# Finance Tracker

Personal finance tracker web app — replaces Google Sheets / Excel with a local web app featuring real-time graphs and smart category suggestions.

## Tech Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js |
| Backend | Express |
| Database | SQLite (better-sqlite3) |
| Frontend | React + Vite |
| Charts | Recharts |
| Styling | Tailwind CSS |

## Quick Start

```bash
# 1. Install backend deps
npm install

# 2. Install frontend deps
cd client && npm install && cd ..

# 3. Run migration (first time only — imports tracker_v5.xlsx)
npm run db:migrate

# 4. Build frontend
npm run build

# 5. Start server
npm start
# → http://localhost:3000
```

## Development

```bash
# Backend (watch mode)
npm run dev

# Frontend (Vite HMR)
cd client && npm run dev
# → http://localhost:5173  (proxies /api → localhost:3000)
```

## Project Structure

```
finace-tracker/
├── src/
│   ├── server.js           # Express entry point
│   ├── db/init.js          # SQLite schema + connection
│   └── routes/             # REST API routes
├── scripts/
│   └── migrate-xlsx.js     # One-time data migration
├── client/                 # React + Vite frontend
│   └── src/
│       ├── pages/          # Dashboard, Transactions
│       └── components/     # Forms, Lists
├── data/                   # SQLite DB (gitignored)
├── ref/                    # Source xlsx (gitignored)
└── docs/                   # Engineering docs
```

## Data Migration

Source: `ref/tracker_v5.xlsx` → SQLite  
Records: 219 transactions + categories + payment methods from v5

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md)
