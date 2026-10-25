// Turns messy text (PDF briefs, voice notes, typed brain dumps) into deadlines and tasks.

import * as chrono from 'chrono-node';

const DEADLINE_WORDS =
  /\b(due|deadline|submit|submission|submitted|hand[- ]?in|exam|test|quiz|assessment|presentation|essay|coursework|report|assignment|problem (?:set|sheet)|project|dissertation|portfolio|midterm|mock)\b/i;

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

let idCounter = 0;

export const newId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${(idCounter++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
export const MIN_MINUTES = 5;
export const MAX_MINUTES = 100 * 60;
export const clampMinutes = (m) => (Number.isFinite(m) ? Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(m))) : 30);

/**
 * Flags explain guesses the parser made, so the review screen can point them out.
 *   time-guessed   no time was written; a default was used
 *   several-dates  the sentence had more than one date; the most deadline-like one was picked
 *   title-guessed  the title came from a nearby heading, not the sentence itself
 *   weight-nearby  the percentage came from the line before or after
 */
export const FLAGS = ['time-guessed', 'several-dates', 'title-guessed', 'weight-nearby'];

const startOfDayLocal = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
/** Past = before now when the time is known; before today when it was guessed. */
export function isPast(date, timeKnown, ref = new Date()) {
  return timeKnown ? date < ref : startOfDayLocal(date) < startOfDayLocal(ref);
}

/**
 * Choose which date in a sentence is the deadline: the one straight after a deadline cue
 * ("due", "submit by", "deadline:") if there is one, otherwise a fallback.
 */
function pickDate(results, text, cue, fallback = 'first') {
  if (results.length === 1) return results[0];
  const cued = results.filter((r) => cue.test(text.slice(Math.max(0, r.index - 40), r.index)));
  if (cued.length) return cued[cued.length - 1];
  return fallback === 'last' ? results[results.length - 1] : results[0];
}
const DEADLINE_CUE = /\b(?:due|deadline|submit\w*|hand(?:ed)?[- ]in|upload\w*|no later than|by|before)\b[^.;]{0,25}$/i;
const TASK_CUE = /\b(?:by|before|due|for|until|on)\b[^.;]{0,12}$/i;

export function findDates(text, ref = new Date()) {
  return chrono.en.GB.parse(text, ref, { forwardDate: true });
}

function resultToDate(result, defaultHour = 12) {
  const d = result.start.date();
  const timeKnown = result.start.isCertain('hour');
  if (!timeKnown) d.setHours(defaultHour, 0, 0, 0);
  return { date: d, timeKnown };
}

const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Whole-word match
export function detectModule(text, modules = []) {
  const sorted = [...new Set(modules)].filter(Boolean).sort((a, b) => b.length - a.length);
  return sorted.find((m) => new RegExp(`(?:^|[^\\p{L}\\p{N}])${reEscape(m)}(?:$|[^\\p{L}\\p{N}])`, 'iu').test(text)) || '';
}

function guessKind(text) {
  const t = text.toLowerCase();
  if (/dissertation/.test(t)) return 'dissertation';
  if (/\bexam|mid-?term|mock\b/.test(t)) return 'exam';
  if (/essay/.test(t)) return 'essay';
  if (/report/.test(t)) return 'report';
  if (/presentation|slides/.test(t)) return 'presentation';
  if (/problem (set|sheet)|exercise|questions/.test(t)) return 'problem set';
  if (/\bquiz|\btest\b/.test(t)) return 'test';
  if (/coursework|assignment|project|portfolio/.test(t)) return 'coursework';
  return 'deadline';
}

const KIND_EFFORT = {
  dissertation: 1200, exam: 480, essay: 360, report: 300, coursework: 300,
  presentation: 180, 'problem set': 180, test: 120, deadline: 180,
};

function tidyTitle(s) {
  let t = s
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—•*·:;,.]+/, '')
    .replace(/[\s\-–—•*·:;,]+$/, '')
    .replace(/\.$/, '')
    .trim();
  if (t.length > 90) t = t.slice(0, 87).replace(/\s\S*$/, '') + '…';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function cleanDeadlineTitle(s) {
  return s
    .replace(/\b(?:takes place|will take place|is held|will be held|is scheduled|will run)\b/gi, '')
    .replace(/\s*(?:,|and)?\s*(?:counts for|is worth|worth|carries|weighted at)\s+\d{1,3}\s?%.*$/i, '')
    .replace(/\s+\d{1,3}\s?%\s*$/, '') // table rows: "Problem Set 1 10%"
    .replace(/\s+(?:must|should|needs? to|will|are to|is to)\s+be\s*(?:submitted|handed in|uploaded|sent)?\s*$/i, '')
    .replace(/^the\s+/i, '');
}

function stripDatePhrase(segment, dateText) {
  const i = segment.indexOf(dateText);
  if (i === -1) return segment;
  let before = segment.slice(0, i);
  let after = segment.slice(i + dateText.length);
  before = before.replace(/\b(?:is|are|will be|must be|should be)?\s*(?:due|submitted|handed in)?\s*(?:on|by|before|for|at|no later than)?\s*(?:the)?\s*$/i, '');
  before = before.replace(/(?:deadline|due date|submission(?: date)?|date)\s*[:\-–]?\s*$/i, '');
  after = after.replace(/^\s*[,.)\]]?\s*(?:at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?/i, '');
  return `${before} ${after}`;
}

/**
 * Find deadlines in the text of a module handbook / assignment brief.
 * Returns candidates for the user to confirm; nothing is added automatically.
 */
export function extractDeadlines(text, { ref = new Date(), modules = [], fileName = '', moduleHint = '' } = {}) {
  const out = [];
  const seen = new Set();
  const fileModule = moduleHint || detectModule(fileName, modules) || detectModule(text.slice(0, 1500), modules);
  // Re-join lines that a PDF wrapped mid-sentence, then split into sentences.
  const joined = [];
  for (const l of text.split(/\n+/).map((x) => x.trim()).filter(Boolean)) {
    const prev = joined[joined.length - 1];
    if (prev && /^[a-z0-9(]/.test(l) && !/[.!?:]$/.test(prev) && prev.length > 40) joined[joined.length - 1] = `${prev} ${l}`;
    else joined.push(l);
  }
  const lines = joined
    .flatMap((l) => l.split(/(?<=[.!?])\s+(?=[A-Z])/))
    .map((l) => l.trim())
    .filter(Boolean);

  let heading = '';
  let headingIdx = -10;
  lines.forEach((line, idx) => {
    if (line.length > 400) return;
    const results = findDates(line, ref).filter((r) => r.start.isCertain('day') || r.start.isCertain('weekday'));
    if (!results.length) {
      if (line.length < 70 && !/[.:;,]$/.test(line) && (DEADLINE_WORDS.test(line) || /^(assignment|task|part|unit)\b/i.test(line))) {
        heading = line;
        headingIdx = idx;
      }
      return;
    }
    if (!DEADLINE_WORDS.test(line)) return;
    if (/\b(every|each|weekly|fortnightly)\b/i.test(line)) return; // recurring classes, not deadlines
    if (/\b(optional|informal|can be|may be)\b/i.test(line) && !/\bmust\b/i.test(line)) return; // nice-to-haves, not deadlines
    const near = idx - headingIdx <= 2 ? heading : '';
    const context = `${near} ${line}`;

    const r = pickDate(results, line, DEADLINE_CUE, 'first');
    const { date, timeKnown } = resultToDate(r);
    if (isPast(date, timeKnown, ref)) return;
    const flags = [];
    if (!timeKnown) flags.push('time-guessed');
    if (results.length > 1) flags.push('several-dates');

    let title = tidyTitle(cleanDeadlineTitle(stripDatePhrase(line, r.text)));
    const vague = title.split(' ').length < 2 || /^(due|deadline|submission|submit|hand|upload|worth|via|date|all|this|it|work)\b/i.test(title);
    if (vague) {
      title = tidyTitle(near || title || 'Deadline');
      flags.push('title-guessed');
    }
    let weightMatch = line.match(/(\d{1,3})\s?%/);
    if (!weightMatch) {
      weightMatch = (near ? (lines[idx - 1] || '').match(/(\d{1,3})\s?%/) : null) || (lines[idx + 1] || '').match(/^.{0,40}?(\d{1,3})\s?%/);
      if (weightMatch) flags.push('weight-nearby');
    }
    const weight = weightMatch && Number(weightMatch[1]) <= 100 ? Number(weightMatch[1]) : null;
    const kind = guessKind(context);
    const key = `${date.toDateString()}|${title.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);

    out.push({
      title,
      due: date.toISOString(),
      timeKnown,
      weight,
      kind,
      estMins: KIND_EFFORT[kind] ?? 180,
      flags,
      module: detectModule(context, modules) || fileModule,
      sourceText: line.slice(0, 200),
    });
  });
  return out.sort((a, b) => new Date(a.due) - new Date(b.due));
}

/**
 * How long a small task takes, in minutes. First matching rule wins, so order matters:
 * explicit times beat verbs, and quick admin verbs ("email my tutor about the essay") beat topic words.
 * `minutes` is a number, or a function of the regex match when the answer depends on what was said.
 */
const ESTIMATE_RULES = [
  { pattern: /(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/, minutes: (m) => Math.round(Number(m[1]) * 60) },
  { pattern: /(\d+)\s*(?:m|min|mins|minute|minutes)\b/, minutes: (m) => Number(m[1]) },
  { pattern: /^(?:email|e-mail|message|text|reply|respond|ask|tell|remind)\b/, minutes: 10 },
  { pattern: /^(?:call|ring|book|sign up|register|print|buy|pay)\b/, minutes: 15 },
  { pattern: /(\d+)\s+slides?\b/, minutes: (m) => Math.min(Number(m[1]) * 20, 240) },
  { pattern: /\bslides?\b/, minutes: 60 },
  { pattern: /\bread\b.*?chapters?\s+(\d+)(?:\s*(?:-|–|to|and|&)\s*(\d+))?/,
    minutes: (m) => Math.min((m[2] ? Math.abs(m[2] - m[1]) + 1 : 1) * 45, 240) },
  { pattern: /\bread|reading\b/, minutes: 45 },
  { pattern: /\bessay|dissertation|write[- ]?up\b/, minutes: 120 },
  { pattern: /\bproblem (?:set|sheet)|exercises?|questions\b/, minutes: 90 },
  { pattern: /\brevis|revision|past paper|practi[cs]e\b/, minutes: 60 },
  { pattern: /\blecture|watch|recording\b/, minutes: 60 },
  { pattern: /\bemail|e-mail|message|text|reply|respond\b/, minutes: 10 },
  { pattern: /\bcall|book|ring|sign up|register\b/, minutes: 15 },
];
const DEFAULT_MINUTES = 30;

export function estimateMinutes(text) {
  const t = text.toLowerCase().replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/g, (w) => NUMBER_WORDS[w]);
  for (const { pattern, minutes } of ESTIMATE_RULES) {
    const m = t.match(pattern);
    if (m) return clampMinutes(typeof minutes === 'function' ? minutes(m) : minutes);
  }
  return DEFAULT_MINUTES;
}

const SPLIT_RE = new RegExp(
  [
    '[.;!?\\n]+',
    '\\b(?:and then|then|also|plus)\\b',
    // "..., and read chapter 4" / "... and email my tutor": split on "and" when a new action follows.
    '(?:,\\s*|\\s+)and\\s+(?=(?:i\\s+)?(?:need|have to|got to|gotta|must|should|remember|want|read|write|email|finish|start|prep|prepare|revise|do|make|book|call|submit|review|practi[cs]e|watch|print|buy|reply|plan|draft|research)\\b)',
    ',\\s*(?=(?:i\\s+)?(?:need|have to|got to|gotta|must|should|remember)\\b)',
  ].join('|'),
  'i',
);

const FILLER_START =
  /^(?:(?:so|um+|uh+|erm+|okay|ok|right|also|and|then|plus|oh|basically|like)\b[\s,]*)+/i;
const NEED_TO =
  /^(?:i\s+)?(?:really\s+|still\s+|also\s+)?(?:need to|needs to|have to|has to|got to|gotta|must|should|want to|wanna|remember to|don'?t forget to|i'?ll|i will)\s+/i;

/** Split a brain dump ("need to prep 3 slides for Friday's seminar and read chapter 4") into tasks. */
export function parseThoughts(text, { ref = new Date(), modules = [] } = {}) {
  const chunks = text.split(SPLIT_RE).map((c) => (c || '').trim()).filter(Boolean);
  const tasks = [];
  const seen = new Set();
  for (const raw of chunks) {
    const chunk = raw.replace(FILLER_START, '').replace(NEED_TO, '').trim();
    if (chunk.split(/\s+/).length < 2) continue;

    let due = null;
    let timeKnown = false;
    const flags = [];
    const dates = findDates(chunk, ref);
    let title = chunk;
    if (dates.length) {
      const r = pickDate(dates, chunk, TASK_CUE, 'last');
      if (dates.length > 1) flags.push('several-dates');
      // A task with no time is due at 09:00 so it's ready in time; if that has already passed today, the end of today.
      const parsed = resultToDate(r, 9);
      if (!parsed.timeKnown && parsed.date < ref) parsed.date.setHours(23, 59, 0, 0);
      due = parsed.date.toISOString();
      timeKnown = parsed.timeKnown;
      if (!timeKnown) flags.push('time-guessed');
      const at = chunk.indexOf(r.text);
      const tail = chunk.slice(at + r.text.length).trim();
      if (!tail || /^[.,!?]*$/.test(tail)) {
        title = chunk.slice(0, at).replace(/\s*\b(?:by|on|for|before|due|until|this|next)\s*$/i, '');
      }
    }
    title = tidyTitle(title);
    if (!title) continue;
    const key = `${title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()}|${due ? due.slice(0, 10) : ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tasks.push({
      title,
      due,
      timeKnown,
      estMins: estimateMinutes(chunk),
      module: detectModule(chunk, modules),
      sourceText: raw,
      flags,
    });
  }
  return tasks;
}
