import { isMockMode, saveMockResponse } from "@/lib/mock-store";
import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { getMemberAccess } from "@/lib/membership";
import { isRateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";

const allowedAnswers = new Set(["ja", "nei", "usikker"]);

function reply(body, status) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function hasValidOrigin(request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function hasValidAnswers(answers, questions) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return false;
  const ids = questions.map(({ id }) => id);
  return Object.keys(answers).length === ids.length && ids.every((id) => allowedAnswers.has(answers[id]));
}

function accessErrorStatus(status) {
  if (status === "answered") return 409;
  if (status === "ended") return 410;
  return 403;
}

export async function POST(request) {
  if (!hasValidOrigin(request)) return reply({ ok: false, message: "Ugyldig forespørsel." }, 403);
  if (isRateLimited(request)) return reply({ ok: false, message: "For mange forespørsler. Prøv igjen om litt." }, 429);
  let body;
  try {
    body = await request.json();
  } catch {
    return reply({ ok: false, message: "Ugyldig forespørsel." }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return reply({ ok: false, message: "Ugyldig forespørsel." }, 400);
  }

  try {
    const access = await getMemberAccess(body.memberToken, body.surveyId);
    if (access.status !== "ready") {
      return reply({ ok: false, message: access.message }, accessErrorStatus(access.status));
    }

    // Honeypot. Ekte brukere ser aldri dette feltet.
    if (body.website) return reply({ ok: true }, 200);

    if (!hasValidAnswers(body.answers, access.survey.questions)) {
      return reply({ ok: false, message: "Alle spørsmål må besvares." }, 400);
    }

    let saved;
    if (isMockMode()) {
      saved = await saveMockResponse(access.member.id, body.surveyId, body.answers);
    } else {
      const sql = getSql();
      const rows = await sql`
        INSERT INTO survey_responses (member_id, survey_id, question_version, questions, answers)
        SELECT ${access.member.id}, ${body.surveyId}, ${access.survey.question_version}, questions, ${JSON.stringify(body.answers)}::jsonb
        FROM surveys
        WHERE id = ${body.surveyId}
          AND is_open = TRUE
          AND deleted_at IS NULL
          AND ends_on >= (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Oslo')::date
        ON CONFLICT (member_id, survey_id) DO NOTHING
        RETURNING id
      `;
      saved = rows.length > 0;
    }
    if (!saved) {
      const latestAccess = await getMemberAccess(body.memberToken, body.surveyId);
      const message = latestAccess.status === "ready"
        ? "Det er allerede registrert en besvarelse for denne tomten i denne undersøkelsen."
        : latestAccess.message;
      return reply({ ok: false, message }, latestAccess.status === "ready" ? 409 : accessErrorStatus(latestAccess.status));
    }
    return reply({ ok: true }, 201);
  } catch {
    return reply({ ok: false, message: "Vi klarte ikke å lagre svaret ditt. Prøv igjen om litt." }, 500);
  }
}
