# Nagpur Panchayat Grievance Platform

This project is now split so you can deploy the frontend and backend separately without changing application logic.

## Project structure

- `frontend/public/` - static frontend for Netlify
- `frontend/public/js/` - frontend application modules
- `frontend/public/env.js` - frontend runtime config file
- `frontend/.env.example` - frontend environment template
- `backend/src/server.js` - lightweight Node server for Render or local hosting
- `backend/package.json` - backend runtime package file
- `backend/.env.example` - backend environment template
- `supabase/schema.sql` - full database schema and RPC functions
- `supabase/seed.sql` - Nagpur district seed data
- `supabase/storage-migration.sql` - storage bucket migration
- `data/initial-credentials.json` - initial staff and citizen logins

## Frontend deploy

Deploy `frontend/public` to Netlify.

Before deploy, update `frontend/public/env.js` with your real values.
You can use `frontend/.env.example` as the reference for which values belong to the frontend.

Frontend config values:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

## Backend deploy

Deploy the `backend/` folder to Render.

Render settings:
- Root Directory: `backend`
- Build Command: none
- Start Command: `npm start`

Backend env values:
- `PORT`

## Local run

Run the backend server from the backend folder:

```bash
cd backend
npm start
```

Then open `http://localhost:3000`.

## Supabase setup

For a fresh setup:
1. Open Supabase SQL Editor.
2. Run `supabase/schema.sql`.
3. Run `supabase/seed.sql`.

For an already running setup that needs proof-photo upload:
1. Run `supabase/storage-migration.sql`.

## Important note

The application frontend talks directly to Supabase for data and auth.
The backend in this project is only a static file server, so separating Netlify and Render is mainly a deployment structure change, not a business-logic change.
