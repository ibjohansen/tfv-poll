export function splitSqlStatements(source) {
  const statements = [];
  let current = '';
  let state = 'normal';
  let dollarTag = '';

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (state === 'line-comment') {
      current += character;
      if (character === '\n') state = 'normal';
      continue;
    }
    if (state === 'block-comment') {
      current += character;
      if (character === '*' && next === '/') {
        current += next;
        index += 1;
        state = 'normal';
      }
      continue;
    }
    if (state === 'single-quote' || state === 'double-quote') {
      current += character;
      const quote = state === 'single-quote' ? "'" : '"';
      if (character === quote && next === quote) {
        current += next;
        index += 1;
      } else if (character === quote) {
        state = 'normal';
      }
      continue;
    }
    if (state === 'dollar-quote') {
      if (source.startsWith(dollarTag, index)) {
        current += dollarTag;
        index += dollarTag.length - 1;
        state = 'normal';
      } else {
        current += character;
      }
      continue;
    }

    if (character === '-' && next === '-') {
      current += character + next;
      index += 1;
      state = 'line-comment';
    } else if (character === '/' && next === '*') {
      current += character + next;
      index += 1;
      state = 'block-comment';
    } else if (character === "'") {
      current += character;
      state = 'single-quote';
    } else if (character === '"') {
      current += character;
      state = 'double-quote';
    } else if (character === '$') {
      const match = source.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (match) {
        dollarTag = match[0];
        current += dollarTag;
        index += dollarTag.length - 1;
        state = 'dollar-quote';
      } else {
        current += character;
      }
    } else if (character === ';') {
      if (current.trim()) statements.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }

  if (['single-quote', 'double-quote', 'block-comment', 'dollar-quote'].includes(state)) {
    throw new Error('Uavsluttet SQL-streng eller kommentar i database/schema.sql');
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}
