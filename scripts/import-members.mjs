import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';
import { parseMembersCsv, memberUpsert } from '../lib/import-members.js';

const file = process.argv[2];
if (!file) throw new Error('Bruk: npm run members:import -- /sti/medlemmer.csv [--apply]');
const { members, skipped } = parseMembersCsv(await readFile(file, 'utf8'));
console.log(JSON.stringify({ accepted: members.length, skipped: skipped.length, pendingHNumber: members.filter((m) => m.h_number === 'N/A').length, skippedRows: skipped }, null, 2));
if (process.argv.includes('--apply')) {
  try {
    const url = process.env.DATABASE_URL_UNPOOLED;
    if (!url || new URL(url).hostname.includes('-pooler')) throw new Error('DATABASE_URL_UNPOOLED mangler eller er en pooled URL');
    const sql = neon(url);
    await sql.transaction(members.map((member) => memberUpsert(sql, member)));
    console.log(`Import fullført: ${members.length} medlemmer. Eksisterende ID-er og lenker er bevart.`);
  } catch (error) {
    console.error('Import mislyktes. Ingen rader er lagret.', {
      code: error.code || error.cause?.code,
      message: error.message,
    });
    process.exitCode = 1;
  }
} else {
  console.log('Forhåndsvisning: ingen endringer. Legg til --apply for å importere.');
}
