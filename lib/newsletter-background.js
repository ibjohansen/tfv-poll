export async function dispatchNewsletter(id, origin) {
  if (typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id) || !process.env.MAILERSEND_JOB_SECRET) throw new Error('Newsletter job not configured');
  const url = new URL('/.netlify/functions/newsletter-background', origin);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid newsletter job origin');
  let response;
  try {
    response = await fetch(url, { method: 'POST', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json', 'X-MailerSend-Job-Secret': process.env.MAILERSEND_JOB_SECRET }, body: JSON.stringify({ campaignId: id }) });
  } catch { throw new Error('Newsletter job dispatch failed'); }
  if (response.status !== 202 || response.redirected) throw new Error('Newsletter job dispatch failed');
}
