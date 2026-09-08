# Project instructions for coding agents

This is a small production-oriented member administration application for Turufjell vel.

## Stack
- JavaScript only. Do not introduce TypeScript.
- Next.js App Router.
- React.
- Node runtime for API route handlers.
- Neon Postgres via @neondatabase/serverless.
- Plain CSS in app/globals.css. Do not add Tailwind unless explicitly requested.

## Product principles
- Keep the visual design restrained, modern and professional.
- Prioritize accessibility and mobile usability.
- Do not collect personal information unless explicitly requested.
- Database credentials must remain server-side.
- Never expose DATABASE_URL to client components or NEXT_PUBLIC variables.

## Survey data
- Questions are configured in data/survey.js.
- Responses are written only through app/survey/api/responses/route.js.
- Valid answers are: ja, nei, usikker.
- Documents are placed in public/survey/dokumenter and configured in data/survey.js.

## Before committing changes
Run:
- npm run lint
- npm run build

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
