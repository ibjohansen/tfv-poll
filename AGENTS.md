# Project instructions for coding agents

This is a small production-oriented survey application for Turufjell vel.

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
- Responses are written only through app/api/responses/route.js.
- Valid answers are: ja, nei, usikker.
- Documents are placed in public/dokumenter and configured in data/survey.js.

## Before committing changes
Run:
- npm run lint
- npm run build
