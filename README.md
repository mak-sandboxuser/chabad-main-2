# Chabad Bedford Member Portal

Member portal for Chabad Bedford with passwordless Clerk login, Salesforce membership verification via Make.com, and a React dashboard.

## Structure

- `frontend/` — React + Vite app (Clerk magic-link auth, member portal UI)
- `backend/` — Express API (Salesforce gate, profile sync, Stripe checkout)

## Setup

### Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Runs on `http://localhost:5000`.

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Runs on `http://localhost:5173`.

## Environment variables

See `backend/.env.example` and `frontend/.env.example`. Never commit real `.env` files.

## Auth flow

1. User enters email on login
2. Backend verifies membership in Salesforce via Make.com webhook
3. Clerk sends a magic link
4. After verification, user lands on the dashboard
