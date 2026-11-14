# SignalCraft AI

SignalCraft researches a named professional from current public business sources and creates an evidence-backed outreach draft for human review.

## Deploy

1. Import this repository into Vercel.
2. Add `OPENAI_API_KEY` as a Production environment variable.
3. Optionally set `OPENAI_MODEL`; the default is `gpt-6-luna`.
4. Deploy.

The API key is used only by the serverless function in `api/research.js`; it is never sent to the browser. The endpoint does not request or return private contact details and does not guess email addresses.

## Local configuration

Copy `.env.example` to `.env.local`, add a project API key, and run with the Vercel development server.
