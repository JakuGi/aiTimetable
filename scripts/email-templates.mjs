#!/usr/bin/env node
/**
 * Auth e-mail templates for Supabase, in the app's squared-notebook style.
 *
 *   node scripts/email-templates.mjs           writes supabase/templates/*.html
 *   node scripts/email-templates.mjs --apply   also uploads subjects + templates to the project
 *
 * --apply needs SUPABASE_ACCESS_TOKEN (supabase.com/dashboard/account/tokens) in the environment
 * or in .env.local. Supabase only accepts custom templates on the free plan once a custom SMTP
 * provider is configured; optional SMTP_* variables below are uploaded in the same request.
 *
 * Templates use only tables and inline styles, no images: they render the same in Gmail,
 * Outlook and Apple Mail, even with images blocked.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'supabase', 'templates');
const PROJECT_REF = 'zykkkkxudmvinrgpwvqc';

const C = {
  paper: '#EEF2F8',
  card: '#FFFFFF',
  line: '#DCE6F2',
  lineSoft: '#E9EFF7',
  ink: '#1B2340',
  ink2: '#47527A',
  muted: '#6B7590',
  pen: '#2B4BDB',
  margin: '#E2483D',
  school: '#2B4BDB',
  bus: '#7C879C',
  task: '#2B4BDB',
  games: '#E2489A',
  leisure: '#E8A317',
};
const FONT = "'Schibsted Grotesk', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const greeting = '{{ if .Data.display_name }}Ahoj {{ .Data.display_name }},{{ else }}Ahoj,{{ end }}';

/** A little week drawn on squared paper: the same picture the app opens with. */
function timetable() {
  // 5 columns x 4 rows of "quarter-hour" squares; colored cells are blocks
  const rows = [
    [['school', 'Mat'], null, ['bus', 'Bus'], null, null],
    [['school', ''], ['task-pencil', 'Referát'], null, ['games', 'Hry'], null],
    [null, ['task-pencil', ''], null, ['games', ''], ['leisure', 'Voľno']],
    [null, null, null, null, ['leisure', '']],
  ];
  const cell = (c, i, r) => {
    const base = `height:22px;border-right:1px solid ${C.lineSoft};border-bottom:1px solid ${C.lineSoft};font-size:11px;line-height:14px;font-weight:700;padding:0 6px;`;
    if (!c) return `<td width="20%" style="${base}">&nbsp;</td>`;
    const [kind, label] = c;
    if (kind === 'task-pencil') {
      return `<td width="20%" style="${base}background:#F1F4FD;border-left:2px dashed ${C.task};border-right:2px dashed ${C.task};${r === 1 ? `border-top:2px dashed ${C.task};` : ''}${r === 2 ? `border-bottom:2px dashed ${C.task};` : ''}color:${C.ink};">${label || '&nbsp;'}</td>`;
    }
    const color = C[kind];
    const solid = kind === 'games';
    return `<td width="20%" style="${base}background:${solid ? color : tint(color)};border-left:3px solid ${color};color:${solid ? '#FFFFFF' : C.ink};">${label || '&nbsp;'}</td>`;
  };
  const body = rows
    .map(
      (row, r) =>
        `<tr>${row.map((c, i) => cell(c, i, r)).join('')}</tr>` +
        // the red "now" line runs under the second row, like the margin line in a notebook
        (r === 1 ? `<tr><td colspan="5" style="height:2px;line-height:2px;font-size:0;background:${C.margin};">&nbsp;</td></tr>` : ''),
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px solid ${C.lineSoft};border-left:1px solid ${C.lineSoft};font-family:${FONT};">${body}</table>`;
}

function tint(hex) {
  // ~17% of the color over white, precomputed so no client has to support color-mix
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.round(255 - (255 - c) * 0.17);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function button(label, href) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 8px;">
  <tr>
    <td style="border-radius:8px;background:${C.pen};">
      <a href="${href}" target="_blank" style="display:inline-block;padding:13px 24px;font-family:${FONT};font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:8px;">${label}</a>
    </td>
  </tr>
</table>`;
}

function code(value) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
  <tr>
    <td style="border:1.5px dashed ${C.pen};border-radius:10px;background:#F1F4FD;padding:14px 22px;font-family:${FONT};font-size:30px;font-weight:800;letter-spacing:8px;color:${C.ink};">${value}</td>
  </tr>
</table>`;
}

function fallbackLink(href) {
  return `<p style="margin:18px 0 0;font-size:13px;line-height:20px;color:${C.muted};">Ak tlačidlo nefunguje, skopíruj si tento odkaz do prehliadača:<br>
<a href="${href}" style="color:${C.pen};word-break:break-all;">${href}</a></p>`;
}

function layout({ title, preheader, body, footer }) {
  return `<!doctype html>
<html lang="sk" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;700;800&display=swap" rel="stylesheet">
<style>
  body { margin:0; padding:0; background:${C.paper}; }
  a { color:${C.pen}; }
  @media (max-width: 560px) {
    .card-pad { padding:24px 20px 28px 18px !important; }
    .outer-pad { padding:16px 10px !important; }
    h1 { font-size:22px !important; line-height:28px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.paper};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper};">
  <tr>
    <td class="outer-pad" align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;">
        <tr>
          <td style="padding:0 4px 14px;font-family:${FONT};">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td width="26" height="26" style="width:26px;height:26px;background:${C.pen};border-radius:7px;font-size:0;line-height:0;">
                <table role="presentation" cellpadding="0" cellspacing="0" width="26" height="26"><tr>
                  <td style="padding:6px 0 0 9px;vertical-align:top;"><div style="width:5px;height:12px;background:#FFFFFF;border-radius:1px;font-size:0;line-height:0;">&nbsp;</div></td>
                  <td style="padding:12px 7px 0 2px;vertical-align:top;"><div style="width:5px;height:6px;background:#F2C14E;border-radius:1px;font-size:0;line-height:0;">&nbsp;</div></td>
                </tr></table>
              </td>
              <td style="padding-left:9px;font-size:18px;font-weight:800;letter-spacing:-0.4px;color:${C.ink};">Rozvrh</td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="background:${C.card};border:1px solid ${C.line};border-radius:16px;overflow:hidden;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:22px 28px 0 30px;">${timetable()}</td></tr>
              <tr>
                <td class="card-pad" style="padding:26px 34px 32px 28px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="border-left:2px solid ${C.margin};padding-left:20px;font-family:${FONT};color:${C.ink2};font-size:15px;line-height:23px;">
${body}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 8px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${C.muted};">
            ${footer}<br>
            Rozvrh, tvoj týždeň, úlohy a voľný čas na jednom mieste.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
`;
}

const h1 = (t) =>
  `<h1 style="margin:0 0 14px;font-family:${FONT};font-size:25px;line-height:31px;font-weight:800;letter-spacing:-0.4px;color:${C.ink};">${t}</h1>`;
const p = (t) => `<p style="margin:0 0 12px;">${t}</p>`;
const small = (t) => `<p style="margin:14px 0 0;font-size:13px;line-height:20px;color:${C.muted};">${t}</p>`;
const notYou =
  'Tento e-mail prišiel na {{ .Email }}, lebo ju niekto zadal v appke Rozvrh. Ak si to nebol ty, môžeš ho pokojne ignorovať.';

export const templates = {
  confirmation: {
    subject: 'Over svoj e-mail a môžeš plánovať',
    html: layout({
      title: 'Over svoj e-mail',
      preheader: 'Jeden klik a tvoj rozvrh je pripravený.',
      body: [
        h1('Ešte jeden klik a môžeš plánovať'),
        p(greeting),
        p('potvrď, že <b style="color:#1B2340;">{{ .Email }}</b> je tvoja adresa. Potom si zapíšeš hodiny, cesty autobusom a úlohy a appka ti navrhne, kedy čo stihnúť.'),
        button('Overiť e-mail', '{{ .ConfirmationURL }}'),
        small('Odkaz môžeš otvoriť aj na inom zariadení, než kde si sa registroval. Platí obmedzený čas, ak vyprší, pošli si nový z prihlasovacej obrazovky.'),
        fallbackLink('{{ .ConfirmationURL }}'),
      ].join('\n'),
      footer: notYou,
    }),
  },

  recovery: {
    subject: 'Nastav si nové heslo do Rozvrhu',
    html: layout({
      title: 'Nové heslo',
      preheader: 'Odkaz na nastavenie nového hesla.',
      body: [
        h1('Nastav si nové heslo'),
        p(greeting),
        p('prišla žiadosť o nové heslo k účtu <b style="color:#1B2340;">{{ .Email }}</b>. Klikni na tlačidlo a vyber si nové.'),
        button('Nastaviť nové heslo', '{{ .ConfirmationURL }}'),
        small('Ak si o zmenu nežiadal, nič nerob. Tvoje heslo ostáva rovnaké a nikto sa k účtu bez tohto odkazu nedostane.'),
        fallbackLink('{{ .ConfirmationURL }}'),
      ].join('\n'),
      footer: notYou,
    }),
  },

  magic_link: {
    subject: 'Tvoj odkaz na prihlásenie do Rozvrhu',
    html: layout({
      title: 'Prihlásenie',
      preheader: 'Prihlás sa jedným klikom, bez hesla.',
      body: [
        h1('Prihlás sa jedným klikom'),
        p(greeting),
        p('tu je odkaz na prihlásenie bez hesla. Funguje len raz a len krátko.'),
        button('Prihlásiť sa', '{{ .ConfirmationURL }}'),
        fallbackLink('{{ .ConfirmationURL }}'),
      ].join('\n'),
      footer: notYou,
    }),
  },

  email_change: {
    subject: 'Potvrď zmenu e-mailu v Rozvrhu',
    html: layout({
      title: 'Zmena e-mailu',
      preheader: 'Potvrď novú e-mailovú adresu svojho účtu.',
      body: [
        h1('Potvrď novú adresu'),
        p(greeting),
        p('e-mail tvojho účtu sa mení z <b style="color:#1B2340;">{{ .Email }}</b> na <b style="color:#1B2340;">{{ .NewEmail }}</b>. Zmena platí až po potvrdení.'),
        button('Potvrdiť zmenu', '{{ .ConfirmationURL }}'),
        small('Ak si e-mail nemenil, ignoruj túto správu a zmeň si heslo.'),
        fallbackLink('{{ .ConfirmationURL }}'),
      ].join('\n'),
      footer: 'Tento e-mail prišiel, lebo niekto požiadal o zmenu adresy účtu v appke Rozvrh.',
    }),
  },

  invite: {
    subject: 'Pozvánka do Rozvrhu',
    html: layout({
      title: 'Pozvánka',
      preheader: 'Máš pozvánku do appky Rozvrh.',
      body: [
        h1('Máš pozvánku do Rozvrhu'),
        p('Ahoj,'),
        p('niekto ťa pozval do Rozvrhu, appky na týždenný rozvrh, úlohy s termínmi a návrhy, kedy čo robiť. Prijmi pozvánku a nastav si heslo.'),
        button('Prijať pozvánku', '{{ .ConfirmationURL }}'),
        fallbackLink('{{ .ConfirmationURL }}'),
      ].join('\n'),
      footer: 'Ak pozvánku nečakáš, môžeš ju ignorovať.',
    }),
  },

  reauthentication: {
    subject: 'Tvoj overovací kód pre Rozvrh',
    html: layout({
      title: 'Overovací kód',
      preheader: 'Kód na potvrdenie citlivej zmeny v účte.',
      body: [
        h1('Potvrď, že si to ty'),
        p(greeting),
        p('na dokončenie zmeny v účte zadaj v appke tento kód:'),
        code('{{ .Token }}'),
        small('Kód platí len krátko. Nikomu ho neposielaj, Rozvrh ťa oň nikdy nebude pýtať e-mailom ani telefonicky.'),
      ].join('\n'),
      footer: notYou,
    }),
  },
};

// ---------------------------------------------------------------------------

function writeFiles() {
  mkdirSync(OUT, { recursive: true });
  for (const [name, t] of Object.entries(templates)) {
    writeFileSync(join(OUT, `${name}.html`), t.html);
  }
  writeFileSync(
    join(OUT, 'subjects.json'),
    `${JSON.stringify(Object.fromEntries(Object.entries(templates).map(([k, t]) => [k, t.subject])), null, 2)}\n`,
  );
  console.log(`Wrote ${Object.keys(templates).length} templates to supabase/templates/`);
}

function loadEnvLocal() {
  const file = join(ROOT, '.env.local');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

async function apply() {
  loadEnvLocal();
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    console.error('Missing SUPABASE_ACCESS_TOKEN (create one at https://supabase.com/dashboard/account/tokens).');
    process.exit(1);
  }
  const body = {};
  for (const [name, t] of Object.entries(templates)) {
    body[`mailer_subjects_${name}`] = t.subject;
    body[`mailer_templates_${name}_content`] = t.html;
  }
  const smtp = {
    smtp_host: process.env.SMTP_HOST,
    smtp_port: process.env.SMTP_PORT,
    smtp_user: process.env.SMTP_USER,
    smtp_pass: process.env.SMTP_PASS,
    smtp_admin_email: process.env.SMTP_SENDER_EMAIL,
    smtp_sender_name: process.env.SMTP_SENDER_NAME ?? 'Rozvrh',
  };
  if (smtp.smtp_host) {
    Object.assign(body, { external_email_enabled: true }, smtp);
    console.log(`Including custom SMTP settings (${smtp.smtp_host}).`);
  }

  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Supabase refused the update (${res.status}): ${text}`);
    if (!smtp.smtp_host) {
      console.error('On the free plan, templates can only be changed after a custom SMTP provider is set up.');
    }
    process.exit(1);
  }
  console.log('Templates uploaded to Supabase.');
}

writeFiles();
if (process.argv.includes('--apply')) await apply();
