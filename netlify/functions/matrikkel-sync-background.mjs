import { processMatrikkelRun } from '../../lib/matrikkel-sync.js';

export default async function handler(request) {
  const secret = process.env.MATRIKKEL_JOB_SECRET;
  if (!secret || request.headers.get('x-matrikkel-job-secret') !== secret) return new Response(null, { status: 403 });
  let input;
  try { input = await request.json(); } catch { return new Response(null, { status: 400 }); }
  if (!/^[a-f0-9]{32}$/.test(input.runId || '')) return new Response(null, { status: 400 });
  const deadline = Date.now() + 13 * 60 * 1000;
  let run;
  do { run = await processMatrikkelRun(input.runId, { batchSize: 10 }); }
  while (run?.status === 'running' && Date.now() < deadline);

  if (run?.status === 'running' && process.env.URL) {
    await fetch(`${process.env.URL}/.netlify/functions/matrikkel-sync-background`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Matrikkel-Job-Secret': secret },
      body: JSON.stringify({ runId: input.runId }),
    });
  }
  return new Response(null, { status: 204 });
}

export const config = { background: true };
