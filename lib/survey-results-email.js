import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { renderSurveyResultsEmail } from './email-templates.js';
import { getEmailI18n } from './i18n/email.js';
import { surveyResultsSections } from '../data/survey-results-message.js';
import { questionOptions } from './survey-questions.js';

import { SURVEY_CHART_COLORS as colors } from './survey-chart-style.js';
const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');


// Match the admin donut: 112px diameter, a 68% hole, clockwise from twelve.
async function donutPng(question, t) {
  const circumference = 2 * Math.PI * 47.04;
  let offset = 0;
  const segments = questionOptions(question).map(({ value }, index) => {
    const length = circumference * Number(question.percentages[value]) / 100;
    const segment = length > 0 ? `<circle cx="56" cy="56" r="47.04" fill="none" stroke="${colors[index % colors.length]}" stroke-width="17.92" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}" transform="rotate(-90 56 56)"/>` : '';
    offset += length;
    return segment;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="112" height="112" viewBox="0 0 112 112"><rect width="112" height="112" fill="#fafafa"/><circle cx="56" cy="56" r="47.04" fill="none" stroke="#e4e4e7" stroke-width="17.92"/>${segments}<text x="56" y="59" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" font-weight="bold" fill="#18181b">${Number(question.answered_count)}</text><text x="56" y="73" text-anchor="middle" font-family="Arial,sans-serif" font-size="9" fill="#71717a">${escape(t('answered'))}</text></svg>`;
  return sharp(Buffer.from(svg), { density: 216 }).png().toBuffer();
}

export async function buildSurveyResultsEmail({ results, baseUrl, isTest = false, locale = 'nb' }) {
  const { t, formatLocale } = getEmailI18n(locale);
  const number = (value) => Number(value).toLocaleString(formatLocale);
  if (!results?.versions?.length || !results.response_count) throw new Error('Survey results required');
  const rendered = renderSurveyResultsEmail({ baseUrl, isTest, locale });
  rendered.html = rendered.html.replaceAll('padding:28px 32px 16px', 'padding:28px 20px 16px').replaceAll('padding:12px 32px 34px', 'padding:12px 20px 34px');
  rendered.html = rendered.html.replace('</head>', '<style>@media only screen and (max-width:520px){.result-column{display:block!important;width:auto!important}.result-question{height:auto!important}}</style></head>');
  const logo = await sharp(await readFile(new URL('../public/Turufjell_liggende_VEL_logo_brun.svg', import.meta.url))).resize({ width: 720 }).png().toBuffer();
  const attachments = [{ filename: 'turufjell-vel.png', id: 'results-logo', disposition: 'inline', content: logo.toString('base64') }];
  let cards = '';
  const textCharts = [];
  for (const version of results.versions) {
    const versionCards = [];
    for (const question of version.questions) {
      const options = questionOptions(question);
      const label = options.map(({ value, label }) => `${label}: ${number(question.percentages[value])} % (${question.counts[value]})`).join(', ');
      const id = `results-chart-${attachments.length}`;
      if (!question.multiple) attachments.push({ filename: `${id}.png`, id, disposition: 'inline', content: (await donutPng(question, t)).toString('base64') });
      const legend = options.map(({ value, label }, index) => `<tr><td style="padding:5px 6px 5px 0;font-size:13px;color:#3f3f46"><span style="color:${colors[index % colors.length]};font-size:18px">●</span> ${escape(label)}</td><td align="right" style="padding:5px 6px;font-size:13px;font-weight:bold;white-space:nowrap">${number(question.percentages[value])} %</td><td align="right" style="padding:5px 0;font-size:12px;color:#71717a">${question.counts[value]}</td></tr>`).join('');
      versionCards.push(`<td class="result-column" width="50%" valign="top" style="width:50%;padding:0 6px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e4e4e7;border-radius:10px;background:#fafafa"><tr><td style="padding:16px"><p style="margin:0 0 6px;font-size:11px;color:#71717a">${escape(t('question', { number: question.number }))}${results.versions.length > 1 ? ` · ${escape(t('version', { version: version.version }))}` : ''}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td class="result-question" height="140" valign="top" style="height:140px;vertical-align:top"><p style="margin:0 0 18px;font-size:15px;line-height:1.5;font-weight:bold">${escape(question.text)}</p></td></tr>${question.multiple ? '' : `<tr><td align="center" style="padding:0 0 16px"><img src="cid:${id}" width="112" height="112" alt="${escape(label)}" style="display:block;width:112px;height:112px;border:0"></td></tr>`}<tr><td><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${legend}</table></td></tr></table></td></tr></table></td>`);
      textCharts.push(`${question.number}. ${question.text}\n${label}`);
    }
    for (let index = 0; index < versionCards.length; index += 2) {
      cards += `<table class="result-row" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="table-layout:fixed"><tr>${versionCards.slice(index, index + 2).join('')}</tr></table>`;
    }
  }
  rendered.html = rendered.html.replace(/<img[^>]+alt="Turufjell Vel"[^>]*>/, '<img src="cid:results-logo" width="240" alt="Turufjell Vel" style="display:block;width:240px;height:auto;max-width:100%;border:0">');
  rendered.html = rendered.html.replace('<!--survey-results-charts-->', `<h2 style="margin:30px 0 16px;font-size:21px;color:#493F39">${escape(t('distribution'))}</h2>${cards}`);
  rendered.text = rendered.text.replace(`${surveyResultsSections[1][0]}\n`, `${t('distribution')}\n\n${textCharts.join('\n\n')}\n\n${surveyResultsSections[1][0]}\n`);
  return { ...rendered, attachments };
}
