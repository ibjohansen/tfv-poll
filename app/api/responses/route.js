import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";

export const runtime = "nodejs";

const allowedAnswers = new Set(["ja", "nei", "usikker"]);
const questionIds = ["q1", "q2", "q3", "q4"];

function isValidAnswers(answers) {
  if (!answers || typeof answers !== "object") {
    return false;
  }

  return questionIds.every((id) => allowedAnswers.has(answers[id]));
}

export async function POST(request) {
  try {
    const body = await request.json();

    // Honeypot. Ekte brukere ser aldri dette feltet.
    if (body.website) {
      return NextResponse.json({ ok: true });
    }

    if (!isValidAnswers(body.answers)) {
      return NextResponse.json(
        { ok: false, message: "Alle spørsmål må besvares." },
        { status: 400 },
      );
    }

    const sql = getSql();
    const { q1, q2, q3, q4 } = body.answers;

    await sql`
      INSERT INTO survey_responses (q1, q2, q3, q4)
      VALUES (${q1}, ${q2}, ${q3}, ${q4})
    `;

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("Kunne ikke lagre undersøkelsessvar:", error);

    return NextResponse.json(
      {
        ok: false,
        message: "Vi klarte ikke å lagre svaret ditt. Prøv igjen om litt.",
      },
      { status: 500 },
    );
  }
}
