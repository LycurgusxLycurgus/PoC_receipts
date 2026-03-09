# Receipt Assistant PoC

Telegram-first bookkeeping intake assistant for Germany.

## Run

```bash
npm install
npm run dev
```

Set the variables from `.env.example` first. The app expects Postgres.

## Included V0 slices

- Telegram webhook intake and outbound replies
- Micro-onboarding
- Receipt / invoice draft creation and one-step clarification flow
- Web inbox, settings, and CSV export
- Audit events and Telegram-linked login links
