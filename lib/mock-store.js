import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { mockMembers } from '../data/mock-members.js';
import { surveyId as currentSurveyId } from '../data/survey.js';

export function isMockMode() {
  return process.env.MOCK_DATA === 'true' && process.env.NODE_ENV !== 'production';
}

function responsePath(memberId, surveyId) {
  const key = createHash('sha256').update(JSON.stringify([memberId, surveyId])).digest('hex');
  return path.join(process.env.MOCK_DATA_DIR || path.join(process.cwd(), '.mock-data'), `${key}.json`);
}

export async function findMockMember(token, surveyId) {
  if (token === 'dddddddddddddddddddddddddddddddd') throw new Error('Simulert databasefeil');
  const fixture = mockMembers.find((member) => member.access_token === token);
  if (!fixture) return undefined;
  const { access_token: ignoredToken, ...member } = fixture;
  void ignoredToken;
  member.has_responded = fixture.has_responded && surveyId === currentSurveyId;
  try {
    await readFile(responsePath(member.id, surveyId), 'utf8');
    member.has_responded = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return member;
}

export async function saveMockResponse(memberId, surveyId, answers) {
  const member = mockMembers.find((entry) => entry.id === memberId);
  if (!member || surveyId !== currentSurveyId) throw new Error('Ugyldig testmedlem eller undersøkelse');
  if (member.has_responded) return false;
  const file = responsePath(memberId, surveyId);
  await mkdir(path.dirname(file), { recursive: true });
  try {
    // Eksklusiv opprettelse sikrer én besvarelse også ved samtidige kall.
    await writeFile(file, JSON.stringify({ memberId, surveyId, answers, createdAt: new Date().toISOString() }), { flag: 'wx' });
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  }
}
