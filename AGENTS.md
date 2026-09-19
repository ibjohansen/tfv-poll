# Project instructions for coding agents

This is a small production-oriented member administration application for Turufjell Vel.

## Stack
- JavaScript only. Do not introduce TypeScript.
- Next.js App Router.
- React.
- Node runtime for API route handlers.
- Neon Postgres via @neondatabase/serverless.
- Global styling lives in app/globals.css. Preserve the existing Tailwind and Material Tailwind setup; do not add another styling system.

## Product principles
- Keep the visual design restrained, modern and professional.
- Prioritize accessibility and mobile usability.
- Do not collect personal information unless explicitly requested.
- Database credentials must remain server-side.
- Never expose DATABASE_URL to client components or NEXT_PUBLIC variables.

## Survey data
- data/survey.js contains the initial seed and mock survey. Runtime survey questions are stored in Neon and managed from the admin portal.
- Responses are written only through app/survey/api/responses/route.js.
- New responses must retain a snapshot of the question version and question text used when the response was submitted.
- Legacy/default answer IDs are ja, nei, usikker (displayed as Ja/Nei/Vet ikke). Questions may define custom stable option IDs and allow one or multiple choices; validate with lib/survey-questions.js. Retain option labels and selection mode in response snapshots.
- Response scope is fixed when invitations start: first response per property by default, or one per invited email. Never replace an effective response with a later submission. Primary-email receipts use the transactional outbox.
- Documents are placed in public/survey/dokumenter and configured in data/survey.js.

## Production and deployment
- Netlify is the application host. `main` is the production branch and `netlify.toml` is the committed deployment configuration.
- Neon provides the production database and private Object Storage. Use pooled `DATABASE_URL` at runtime and `DATABASE_URL_UNPOOLED` only for schema migrations and imports.
- Microsoft Entra ID is the identity provider. Production login requires the exact Web redirect URI documented in README.md.
- Read and follow `Produksjonssetting: Netlify + Neon + Microsoft Entra ID` in README.md before changing deployment configuration.
- Never commit `.env.local`, `.neon`, `.netlify`, credentials, tokens, database dumps or member exports.
- Never bulk-import `.env.local` into Netlify. Add the documented production variables individually and keep them scoped to the production deploy context unless the user explicitly defines an isolated preview environment.
- Do not run a production deploy, alter Netlify environment variables, change Entra configuration, apply a Neon schema/configuration change, or push to GitHub unless the user explicitly requests that external change.
- When adding or renaming an environment variable, route, background function or infrastructure service, update the production procedure and verification checklist in README.md in the same change.

## Before committing changes
- Always create a commit message, use this when instructed to commit
- Run `npm run check`.
- Run `npm audit` when dependencies or the lockfile change.
- Confirm `git diff --check` passes and verify that no local secrets or generated exports are staged.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
