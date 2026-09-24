# Project instructions for coding agents

This is a small production-oriented member administration application for Turufjell Vel.

## Model and reasoning selection

Before starting each task, select the lowest-cost available Codex model and reasoning level likely to meet the task’s
quality requirements. Then compare that selection with the current configuration.

Do not justify keeping the current model merely because it can perform the task. A more expensive model needs a
concrete, task-specific justification.

### Selection rules

- Prefer a cheaper model and lower reasoning level for straightforward edits, summaries, and routine execution of
  existing checks.
- Use Terra / medium as the starting candidate for scoped engineering work:
  single-feature accessibility audits, ordinary debugging, focused code reviews, and test implementation.
- Several files, multiple tool calls, or a combination of automated and manual checks do not, by themselves, justify a
  stronger model.
- Recommend a stronger model or higher reasoning level only when identifiable ambiguity, architectural complexity,
  consequences of error, or demanding verification requirements make the cheaper candidate unlikely to succeed. State
  that reason in one sentence.
- Reassess if the work reveals complexity that was not apparent initially.
- Treat recommendations as informed judgments, not guarantees. Do not claim knowledge of the active model, reasoning
  setting, availability, or pricing unless that information is available.

### Response and switching

State the assessment before starting task work.

If the current configuration is the preferred choice:
`Model assessment: current model / current reasoning level is the recommended choice for this task.`

If another configuration offers better value:
`Model assessment: switch recommended to <model> / <reasoning level> — <brief task-specific reason>.`

When recommending a switch, pause task execution and wait for the user's choice. The user changes the model through the
model picker or `/model`; a recommendation does not change it automatically.

When the request itself concerns explaining or revising this policy, provide the assessment and answer directly without
requiring a model-switch decision.

## Stack

- JavaScript only. Do not introduce TypeScript.
- Next.js App Router.
- React.
- Node runtime for API route handlers.
- Neon Postgres via @neondatabase/serverless.
- Global styling lives in app/globals.css. Preserve the existing Tailwind and Material Tailwind setup; do not add
  another styling system.

## Product principles

- Keep the visual design restrained, modern and professional.
- Prioritize accessibility and mobile usability.
- Do not collect personal information unless explicitly requested.
- Database credentials must remain server-side.
- Never expose DATABASE_URL to client components or NEXT_PUBLIC variables.

## Survey data

- data/survey.js contains the initial seed and mock survey. Runtime survey questions are stored in Neon and managed from
  the admin portal.
- Responses are written only through app/survey/api/responses/route.js.
- New responses must retain a snapshot of the question version and question text used when the response was submitted.
- Legacy/default answer IDs are ja, nei, usikker (displayed as Ja/Nei/Vet ikke). Questions may define custom stable
  option IDs and allow one or multiple choices; validate with lib/survey-questions.js. Retain option labels and
  selection mode in response snapshots.
- Response scope is fixed when invitations start: first response per property by default, or one per invited email.
  Never replace an effective response with a later submission. Primary-email receipts use the transactional outbox.
- Documents are placed in public/survey/dokumenter and configured in data/survey.js.

## Production and deployment

- Netlify is the application host. `main` is the production branch and `netlify.toml` is the committed deployment
  configuration.
- Neon provides the production database and private Object Storage. Use pooled `DATABASE_URL` at runtime and
  `DATABASE_URL_UNPOOLED` only for schema migrations and imports.
- Microsoft Entra ID is the identity provider. Production login requires the exact Web redirect URI documented in
  README.md.
- Read and follow `Produksjonssetting: Netlify + Neon + Microsoft Entra ID` in README.md before changing deployment
  configuration.
- Never commit `.env.local`, `.neon`, `.netlify`, credentials, tokens, database dumps or member exports.
- Never bulk-import `.env.local` into Netlify. Add the documented production variables individually and keep them scoped
  to the production deploy context unless the user explicitly defines an isolated preview environment.
- Do not run a production deploy, alter Netlify environment variables, change Entra configuration, apply a Neon
  schema/configuration change, or push to GitHub unless the user explicitly requests that external change.
- When adding or renaming an environment variable, route, background function or infrastructure service, update the
  production procedure and verification checklist in README.md in the same change.

## Before committing changes

- Always create a commit message, use this when instructed to commit
- Run `npm run check`.
- Run `npm audit` when dependencies or the lockfile change.
- Confirm `git diff --check` passes and verify that no local secrets or generated exports are staged.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read
the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next`
package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at
`node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted
change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
