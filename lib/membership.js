import { isMockMode, findMockMember } from "./mock-store.js";
import { getSql } from "./db.js";
import { surveyEndsOn, surveyId as currentSurveyId, surveyQuestions, surveyVersion } from "../data/survey.js";
import { normalizeSurveyEndDate, surveyHasEnded } from "./survey-dates.js";

export function validateAccess(memberToken, surveyId) {
  if (memberToken === undefined || memberToken === null || memberToken === "") {
    return { status: "missing", message: "Medlems-ID mangler i lenken. Åpne den fullstendige lenken du har fått fra Turufjell vel." };
  }
  if (typeof memberToken !== "string" || !/^[a-f0-9]{32}$/i.test(memberToken)) {
    return { status: "invalid", message: "Medlems-ID har feil format. Kontroller at hele lenken er med." };
  }
  if (typeof surveyId !== "string" || !/^[a-f0-9]{32}$/i.test(surveyId)) {
    return { status: "invalid-survey", message: "Undersøkelses-ID mangler eller er ugyldig. Bruk lenken til denne undersøkelsen." };
  }
  return null;
}

export async function getMemberAccess(memberToken, surveyId, database) {
  const validation = validateAccess(memberToken, surveyId);
  if (validation) return validation;

  let member;
  if (!database && isMockMode()) {
    if (surveyId !== currentSurveyId) return { status: "invalid-survey", message: "Undersøkelsen finnes ikke i testdataene." };
    member = await findMockMember(memberToken.toLowerCase(), surveyId);
    if (member) member.survey = { id: surveyId, is_open: true, ends_on: surveyEndsOn, question_version: surveyVersion, questions: surveyQuestions };
  } else {
    const sql = database ?? getSql();
    const [survey] = await sql`SELECT id, is_open, ends_on, question_version, questions FROM surveys WHERE id = ${surveyId} AND deleted_at IS NULL`;
    const endsOn = normalizeSurveyEndDate(survey?.ends_on);
    if (!survey || !endsOn) {
      return { status: "invalid-survey", message: "Undersøkelsen finnes ikke i databasen." };
    }
    survey.ends_on = endsOn;
    if (surveyHasEnded(survey.ends_on)) {
      return { status: "ended", survey, message: "Undersøkelsen er avsluttet. Det er ikke lenger mulig å sende inn svar." };
    }
    if (survey.is_open === false || (survey.questions !== undefined && (!Array.isArray(survey.questions) || !survey.questions.length))) {
      return { status: "invalid-survey", message: "Undersøkelsen finnes ikke i databasen." };
    }
    [member] = await sql`
      SELECT m.id, m.h_number, m.cadastral_number, m.section_number, m.street_address,
        m.title_holder, m.registration_date,
        m.primary_contact_name, m.primary_contact_email, m.other_contact_emails,
        EXISTS (
          SELECT 1 FROM survey_responses r
          WHERE r.member_id = m.id AND r.survey_id = ${surveyId}
        ) AS has_responded
      FROM members m
      WHERE m.access_token = ${memberToken.toLowerCase()}
        AND m.access_revoked_at IS NULL
        AND m.access_expires_at > NOW()
        AND m.deleted_at IS NULL
    `;
    if (member) member.survey = survey;
  }
  if (member?.survey && surveyHasEnded(member.survey.ends_on)) {
    return { status: "ended", survey: member.survey, message: "Undersøkelsen er avsluttet. Det er ikke lenger mulig å sende inn svar." };
  }
  if (!member) {
    return { status: "not-found", message: "Medlems-ID finnes ikke i medlemsregisteret. Kontakt Turufjell vel for en gyldig lenke." };
  }
  const publicMember = {
    id: member.id,
    h_number: member.h_number,
    cadastral_number: member.cadastral_number,
    section_number: member.section_number,
    street_address: member.street_address,
    title_holder: member.title_holder,
    registration_date: member.registration_date,
    primary_contact_name: member.primary_contact_name,
    primary_contact_email: member.primary_contact_email,
    other_contact_emails: member.other_contact_emails,
    has_responded: member.has_responded,
  };
  if (member.has_responded) {
    return { status: "answered", member: publicMember, survey: member.survey, message: "Det er allerede registrert en besvarelse for denne tomten i denne undersøkelsen. Skjemaet kan bare sendes inn én gang." };
  }
  return { status: "ready", member: publicMember, survey: member.survey, message: "Medlemslenken er gyldig. Kontroller tomteopplysningene nedenfor før du svarer." };
}
