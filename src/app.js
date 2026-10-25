import { extractDeadlines, parseThoughts, newId } from './parser.js';
import { sanitizeState, sanitizeItem, sanitizeClass, sanitizeSettings, hoursToMinutes, overlappingClasses, blankState, THEMES } from './state.js';
import { buildPlan, focusBlock, startOfWeek, startOfDay, weekdayIndex, toMinutes } from './scheduler.js';
import { icon, hydrateIcons, kindIcon } from './icons.js';

// State
const STORE_KEY = 'followthru-v1';
let state = sanitizeState(load());
let plan = { blocks: [], risks: {} };
let undoSnapshot = null;
let pendingCompletion = null;
let selectedDate = startOfDay(new Date());
let pathExpanded = false;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)); } catch { return null; }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {}
}

function cancelPendingCompletion() {
  if (!pendingCompletion) return;
  clearTimeout(pendingCompletion);
  pendingCompletion = null;
}
function commit(message, mutate, { undoable = true, toastIcon = 'check' } = {}) {
  cancelPendingCompletion();
  const before = JSON.stringify(state);
  mutate();
  if (undoable) undoSnapshot = before;
  save();
  render();
  if (message) toast(message, { undoable, iconName: toastIcon });
}

// Helpers
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtDay = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtWeekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long' });
const fmtDM = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const fmtTime = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
const pad = (n) => String(n).padStart(2, '0');
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fromLocalInput = (v) => {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
};
const dayDiff = (d, now = new Date()) => Math.round((startOfDay(d) - startOfDay(now)) / 864e5);

function duration(mins) {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (!h) return `${m} min`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function dayName(d, now = new Date()) {
  const n = dayDiff(d, now);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return fmtWeekday.format(d);
  return fmtDay.format(d);
}
const when = (d) => `${dayName(d)}, ${fmtTime.format(d)}`;
function relative(date, now = new Date()) {
  const days = dayDiff(date, now);
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days < 0) return days === -1 ? 'Was due yesterday' : `Was due ${-days} days ago`;
  if (days < 14) return `In ${days} days`;
  return `In ${Math.round(days / 7)} weeks`;
}

const modules = () =>
  [...new Set([...state.classes.map((c) => c.module), ...state.items.map((i) => i.module)].filter(Boolean))].sort();
function moduleColour(name) {
  if (!name) return 'transparent';
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `var(--m${h % 8})`;
}
const tag = (m) => (m ? `<span class="tag" style="--mc:${moduleColour(m)}">${esc(m)}</span>` : '');
const itemById = (id) => state.items.find((i) => i.id === id);
const blocksFor = (id) => plan.blocks.filter((b) => b.itemId === id);
const isTask = (it) => it.kind === 'task';


function stones(item, { label = true } = {}) {
  const n = Math.min(8, Math.max(1, Math.round(item.estMins / 60)));
  const doneN = item.done ? n : Math.min(n, Math.floor(((item.doneMins || 0) / item.estMins) * n + 1e-9));
  let html = `<ol class="stones" aria-label="${doneN} of ${n} steps done">`;
  for (let i = 0; i < n; i++) {
    const cls = i < doneN ? 'done' : i === doneN ? 'next' : 'later';
    const inner = cls === 'done' ? icon('check') : cls === 'next' ? icon('dot') : '';
    html += `<li class="stone ${cls}">${inner}<span class="sr-only">${cls === 'done' ? 'done' : cls === 'next' ? 'next step' : 'to do'}</span></li>`;
  }
  html += '</ol>';
  const txt = item.done ? 'All done' : `${duration(item.doneMins || 0)} of ~${duration(item.estMins)} done`;
  return `<div class="stones-wrap">${html}${label ? `<span class="stones-label">${txt}</span>` : ''}</div>`;
}

// Routing
const ROUTES = ['now', 'add', 'week', 'path'];
function route() {
  const r = ROUTES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'now';
  $$('.screen').forEach((s) => (s.hidden = s.dataset.screen !== r));
  $$('.nav a').forEach((a) => (a.dataset.route === r ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  window.scrollTo(0, 0);
  return r;
}
window.addEventListener('hashchange', () => { route(); $('#main').focus({ preventScroll: true }); });

// Render
function render() {
  plan = buildPlan({
    classes: state.classes, items: state.items, now: new Date(),
    dayStart: state.settings.dayStart, dayEnd: state.settings.dayEnd,
  });
  $('#moduleList').innerHTML = modules().map((m) => `<option value="${esc(m)}"></option>`).join('');
  renderNow();
  renderWeek();
  renderPath();
}

// NOW
const EMPTY_NOW = {
  idle: {
    icon: 'sun', title: 'Nothing to do right now.', href: '#add', cta: 'Add something',
    text: 'Say, type or drop in what’s on your plate. You’ll get one clear next step.',
  },
  full: {
    icon: 'clock', title: 'No free time left to plan into.', href: '#week', cta: 'Open my week',
    text: 'Widen your planning hours on the Week screen, or lower the hours on a task.',
  },
};

function emptyNowHTML({ icon: ic, title, text, href, cta }) {
  return `
    <div class="empty-now">
      <span class="big-icon">${icon(ic)}</span>
      <p class="kicker">${icon('target')}Now</p>
      <h2 class="now-title">${title}</h2>
      <p class="lede">${text}</p>
      <a class="primary" href="${href}">${icon('arrow')}${cta}</a>
    </div>`;
}

function nowWhenHTML(block, started) {
  if (started) return `<span class="live">${icon('target')}Now</span> until ${fmtTime.format(block.end)}`;
  return `${icon('clock')}Next · ${when(block.start)}`;
}

function nowFactsHTML(item, mins) {
  const due = item.due ? `<span class="fact">${icon('calendar')}Due ${when(new Date(item.due))}</span>` : '';
  return `${tag(item.module)}<span class="fact">${icon('clock')}${duration(mins)} session</span>${due}`;
}

function laterHTML(blocks) {
  if (!blocks.length) return '';
  const rows = blocks
    .filter((b) => itemById(b.itemId))
    .map((b) => `<li><time>${when(b.start)}</time><span>${esc(itemById(b.itemId).title)}</span></li>`).join('');
  return `
    <details class="disclose now-after">
      <summary>${icon('chev')}What’s after this?</summary>
      <ol>${rows}</ol>
    </details>`;
}

const NOW_ACTIONS = `
  <div class="now-actions">
    <button class="primary" data-act="did-block" type="button">${icon('check', 'done-check')}<span>Done</span></button>
    <button class="secondary" data-act="not-now" type="button">${icon('skip')}Not now</button>
    <button class="text-btn" data-act="finish-item" type="button">${icon('checkCircle')}The whole thing’s finished</button>
  </div>`;


function completeThen(el, message, mutate) {
  cancelPendingCompletion();
  el.classList.add('completing');
  $$('.now-actions button', el).forEach((b) => (b.disabled = true));
  pendingCompletion = setTimeout(() => {
    pendingCompletion = null;
    commit(message, mutate);
    $('#nowBody .primary')?.focus({ preventScroll: true });
  }, reduceMotion.matches ? 0 : 700);
}

function renderNow() {
  const el = $('#nowBody');
  el.classList.remove('completing');
  const now = new Date();
  const block = focusBlock(plan.blocks, now);

  if (!block) {
    el.innerHTML = emptyNowHTML(state.items.some((i) => !i.done) ? EMPTY_NOW.full : EMPTY_NOW.idle);
    return;
  }

  const item = itemById(block.itemId);
  const mins = (block.end - block.start) / 6e4;
  const later = plan.blocks.filter((b) => b !== block && b.start >= block.end).slice(0, 3);

  el.innerHTML = `
    <p class="now-when">${nowWhenHTML(block, block.start <= now)}</p>
    <h2 class="now-title">${esc(item.title)}</h2>
    <div class="now-facts">${nowFactsHTML(item, mins)}</div>
    ${stones(item)}
    ${NOW_ACTIONS}
    ${laterHTML(later)}`;

 
  const id = item.id;
  $('[data-act="did-block"]', el).onclick = (e) => {
    $('span', e.currentTarget).textContent = 'Nice';
    completeThen(el, `Nice. One step done on “${item.title}”.`, () => {
      const it = itemById(id);
      if (!it) return;
      it.doneMins = Math.min(it.estMins, (it.doneMins || 0) + mins);
      it.snoozeUntil = null;
      if (it.doneMins >= it.estMins) it.done = true;
    });
  };
  $('[data-act="not-now"]', el).onclick = () => {
    const from = Math.max(Date.now(), block.start.getTime());
    // Snooze for an hour from now (or from the session's start, if it hasn't started yet).
    const firstStarts = () => new Map(plan.blocks.map((b) => [b.itemId, b.start.getTime()]).reverse());
    const before = firstStarts();
    commit(null, () => { const it = itemById(id); if (it) it.snoozeUntil = new Date(from + 60 * 6e4).toISOString(); });
    // Say exactly what moved: the snoozed task, and anything that moved up into the gap.
    const after = firstStarts();
    const movedUp = [...after].filter(([other, t]) => other !== id && before.has(other) && t !== before.get(other));
    const moved = blocksFor(id)[0];
    const head = moved ? `Moved to ${when(moved.start)}.` : 'Moved later; no free time left before its deadline.';
    const tail = !movedUp.length ? ' Nothing else changed.'
      : movedUp.length === 1 ? ` “${itemById(movedUp[0][0]).title}” moved up to ${when(new Date(movedUp[0][1]))}.`
      : ` ${movedUp.length} other sessions moved up to fill the gap.`;
    toast(head + tail, { undoable: true, iconName: 'skip' });
  };
  $('[data-act="finish-item"]', el).onclick = () =>
    completeThen(el, `“${item.title}” is finished.`, () => { const it = itemById(id); if (it) it.done = true; });
}

// WEEK: one day at a time 
const minutesOf = (d) => d.getHours() * 60 + d.getMinutes();

function dayEntries(date) {
  const now = new Date();
  const end = new Date(date);
  end.setDate(end.getDate() + 1);
  const current = focusBlock(plan.blocks, now);

  const classes = state.classes
    .filter((c) => Number(c.day) === weekdayIndex(date))
    .map((c) => ({
      key: `c:${c.id}`, sort: toMinutes(c.start), start: c.start, end: c.end, icon: 'book', variant: '',
      title: c.module, kind: c.type, extra: c.location && `${icon('pin')} ${esc(c.location)}`,
      module: c.module, open: () => openClassDialog(c),
    }));

  const work = plan.blocks
    .filter((b) => b.start >= date && b.start < end)
    .map((b) => {
      const it = itemById(b.itemId);
      const live = b === current && b.start <= now;
      return {
        key: `i:${it.id}`, sort: minutesOf(b.start), start: fmtTime.format(b.start), end: fmtTime.format(b.end),
        icon: 'pencil', variant: `work${live ? ' now-slot' : ''}`, title: it.title,
        kind: live ? 'Happening now' : 'Planned work', extra: b.parts > 1 && `Session ${b.part} of ${b.parts}`,
        module: it.module, open: () => openItemDialog(it),
      };
    });

  const due = state.items
    .filter((i) => i.due && !i.done && new Date(i.due) >= date && new Date(i.due) < end)
    .map((i) => {
      const d = new Date(i.due);
      return {
        key: `i:${i.id}`, sort: minutesOf(d) + 0.1, start: i.timeKnown === false ? 'Any time' : fmtTime.format(d),
        icon: 'flag', variant: 'due', title: i.title,
        kind: i.timeKnown === false ? `Deadline (no time given, planned for ${fmtTime.format(d)})` : 'Deadline',
        extra: i.module && esc(i.module), module: i.module, open: () => openItemDialog(i),
      };
    });

  return [...classes, ...work, ...due].sort((a, b) => a.sort - b.sort);
}

function slotHTML(e, i) {
  return `
    <li><button class="slot clickable ${e.variant}" type="button" data-i="${i}" style="--mc:${moduleColour(e.module)}">
      <time>${e.start}${e.end ? `<small>${e.end}</small>` : ''}</time>
      <span class="slot-icon">${icon(e.icon)}</span>
      <span>
        <span class="slot-t">${esc(e.title)}</span>
        <span class="slot-s"><span class="slot-kind">${esc(e.kind)}</span>${e.extra ? `<span>${e.extra}</span>` : ''}</span>
      </span>
    </button></li>`;
}

const fmtWd = new Intl.DateTimeFormat('en-GB', { weekday: 'short' });
const countLabel = (n) => (n ? `${n} thing${n > 1 ? 's' : ''}` : 'free');

function dayTabHTML(date, { selected, today, count }) {
  const label = `${fmtWeekday.format(date)} ${fmtDM.format(date)}${today ? ', today' : ''}: ${count ? countLabel(count) : 'nothing planned'}`;
  return `
    <button class="day ${today ? 'today' : ''}" role="tab" type="button" aria-selected="${selected}"
      data-date="${date.getTime()}" aria-label="${esc(label)}">
      <span class="dn">${fmtWd.format(date)}</span><span class="dd">${date.getDate()}</span><span class="dc">${countLabel(count)}</span>
    </button>`;
}

const EMPTY_DAY = `<li class="agenda-empty"><span class="big-icon">${icon('coffee')}</span><span>Nothing planned. A free day.</span></li>`;

function renderWeek() {
  const now = new Date();
  const weekStart = startOfWeek(selectedDate);
  $('#weekLabel').textContent = fmtDM.format(weekStart);
  $('#weekTitle').textContent = dayName(selectedDate, now);

  const week = Array.from({ length: 7 }, (_, d) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + d);
    return date;
  });
  $('#days').innerHTML = week
    .map((date) => dayTabHTML(date, {
      selected: date.getTime() === selectedDate.getTime(),
      today: dayDiff(date, now) === 0,
      count: new Set(dayEntries(date).map((e) => e.key)).size,
    }))
    .join('');
  $$('#days .day').forEach((b) => (b.onclick = () => { selectedDate = new Date(Number(b.dataset.date)); renderWeek(); }));

  const entries = dayEntries(selectedDate);
  $('#agenda').innerHTML = entries.length ? entries.map(slotHTML).join('') : EMPTY_DAY;
  $$('#agenda .slot').forEach((b) => (b.onclick = () => entries[b.dataset.i].open()));
}

// PATH: deadlines as stepping stones
function stepHTML(item, { first = false } = {}) {
  const due = item.due ? new Date(item.due) : null;
  const next = blocksFor(item.id)[0];
  const short = plan.risks[item.id];
  const details = [
    item.module && `<div>${icon('book')}${esc(item.module)}</div>`,
    item.weight != null && item.weight !== '' && `<div>${icon('percent')}${item.weight}% of the module</div>`,
    due && `<div>${icon('calendar')}${fmtDay.format(due)}, ${fmtTime.format(due)}${item.timeKnown === false ? ' (no time given, so this is a guess)' : ''}</div>`,
    next && !item.done && `<div>${icon('clock')}Next session ${when(next.start)}</div>`,
  ].filter(Boolean).join('');
  return `
    <li class="step ${first ? 'first' : ''} ${item.done ? 'done' : ''}">
      <span class="step-icon" style="--mc:${moduleColour(item.module)}">${icon(item.done ? 'check' : kindIcon(item.type, isTask(item)))}</span>
      <div class="step-body">
        ${due ? `<p class="step-when">${icon('calendar')}${relative(due)} · ${dayName(due)}</p>` : ''}
        <h3 class="step-title">${esc(item.title)}</h3>
        ${stones(item)}
        ${short && !item.done ? `<p class="note">${icon('alert')}<span><strong>About ${duration(short)} won’t fit before this is due.</strong>
          Next step: free up an evening, lower the hours if it’s smaller than it looks, or ask about an extension.</span></p>` : ''}
        <details class="disclose">
          <summary>${icon('chev')}Details</summary>
          <div class="details-grid">${details || '<div>No extra details.</div>'}</div>
          <div class="step-actions">
            ${item.done
              ? `<button class="secondary" type="button" data-action="undone" data-id="${item.id}">${icon('undo')}Not finished</button>`
              : `<button class="secondary" type="button" data-action="done" data-id="${item.id}">${icon('check')}Mark finished</button>`}
            <button class="text-btn" type="button" data-action="edit" data-id="${item.id}">${icon('pencil')}Edit</button>
          </div>
        </details>
      </div>
    </li>`;
}

function renderPath() {
  const open = state.items.filter((i) => !i.done);
  const dated = open.filter((i) => i.due).sort((a, b) => new Date(a.due) - new Date(b.due));
  const undated = open.filter((i) => !i.due);
  const done = state.items.filter((i) => i.done);
  const LIMIT = 3;

  $('#pathLede').textContent = dated.length
    ? `${dated.length} deadline${dated.length > 1 ? 's' : ''} ahead. The nearest: ${relative(new Date(dated[0].due)).toLowerCase()}.`
    : 'Nothing due yet. Drop in a module handbook and your deadlines appear here.';
  const shown = pathExpanded ? dated : dated.slice(0, LIMIT);
  $('#pathList').innerHTML = shown.map((it, i) => stepHTML(it, { first: i === 0 })).join('');
  const more = $('#pathMore');
  more.hidden = dated.length <= LIMIT;
  more.innerHTML = pathExpanded ? `${icon('chev')}Show only the next ${LIMIT}` : `${icon('chev')}Show ${dated.length - LIMIT} more`;
  more.querySelector('svg').style.transform = pathExpanded ? 'rotate(180deg)' : '';

  $('#undatedWrap').hidden = !undated.length;
  $('#undatedSummary').textContent = `Tasks with no date (${undated.length})`;
  $('#undatedList').innerHTML = undated.map((it) => stepHTML(it)).join('');
  $('#doneWrap').hidden = !done.length;
  $('#doneSummary').textContent = `Finished (${done.length})`;
  $('#doneList').innerHTML = done.map((it) => stepHTML(it)).join('');

}

const PATH_ACTIONS = {
  edit: (it) => openItemDialog(it),
  done: (it) => commit(`“${it.title}” is finished.`, () => { it.done = true; }),
  undone: (it) => commit(`“${it.title}” is back on your path.`, () => {
    it.done = false;
    if (it.doneMins >= it.estMins) it.doneMins = 0;
  }, { toastIcon: 'undo' }),
};
$('[data-screen="path"]').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  const it = btn && itemById(btn.dataset.id);
  if (it) PATH_ACTIONS[btn.dataset.action]?.(it);
});
$('#pathMore').onclick = () => { pathExpanded = !pathExpanded; renderPath(); };

// Toast 
let toastTimer;
function toast(msg, { undoable = false, iconName = 'check' } = {}) {
  $('#toastIcon').innerHTML = icon(iconName);
  $('#toastMsg').textContent = msg;
  $('#toastUndo').hidden = !undoable || !undoSnapshot;
  const t = $('#toast');
  t.hidden = true;
  void t.offsetWidth;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.hidden = true;
    undoSnapshot = null;
  }, 7000);
}
$('#toastUndo').onclick = () => {
  if (!undoSnapshot) return;
  cancelPendingCompletion();
  const theme = state.settings.theme;
  state = sanitizeState(JSON.parse(undoSnapshot));
  state.settings.theme = theme;
  undoSnapshot = null;
  syncHourSelects();
  save();
  applyTheme();
  render();
  toast('Undone. Everything is back how it was.', { iconName: 'undo' });
};

// Review sheet 
function flagsHTML(c) {
  const due = c.due ? new Date(c.due) : null;
  const text = {
    'time-guessed': due && `No time given, so ${fmtTime.format(due)} is a guess.`,
    'several-dates': 'This sentence has more than one date. Check it picked the right one.',
    'title-guessed': 'The name came from a nearby heading.',
    'weight-nearby': 'The weighting came from the next line.',
  };
  const notes = (c.flags || []).map((f) => text[f]).filter(Boolean);
  return notes.length ? `<span class="rv-flags">${notes.map((n) => `<span>${icon('alert')}${n}</span>`).join('')}</span>` : '';
}

function openReview(candidates, { heading, source }) {
  const list = $('#reviewRows');
  $('#reviewTitle').textContent = heading;
  const meta = (c) => [
    c.due && `<span>${icon('calendar')} ${fmtDay.format(new Date(c.due))}, ${fmtTime.format(new Date(c.due))}</span>`,
    `<span>${icon('clock')} ~${duration(c.estMins)}</span>`,
    c.module && `<span>${icon('book')} ${esc(c.module)}</span>`,
    c.weight != null && `<span>${icon('percent')} ${c.weight}%</span>`,
  ].filter(Boolean).join('');

  list.innerHTML = candidates.map((c, i) => `
    <li class="rv" data-i="${i}">
      <label class="rv-top">
        <input class="rv-check" type="checkbox" checked />
        <span><span class="rv-t">${esc(c.title)}</span><span class="rv-s">${meta(c)}</span>${flagsHTML(c)}</span>
      </label>
      <details class="disclose">
        <summary>${icon('chev')}Edit</summary>
        <div class="rv-fields">
          <label class="field"><span>What</span><input name="title" value="${esc(c.title)}" /></label>
          <label class="field"><span>Module</span><input name="module" list="moduleList" value="${esc(c.module || '')}" /></label>
          <label class="field"><span>Due</span><input name="due" type="datetime-local" value="${toLocalInput(c.due)}" /></label>
          <label class="field"><span>Hours of work</span><input name="hours" type="number" min="0.05" step="any" value="${+(c.estMins / 60).toFixed(2)}" /></label>
          ${c.sourceText ? `<p class="rv-src">Found in: “${esc(c.sourceText)}”</p>` : ''}
        </div>
      </details>
    </li>`).join('');

  const update = () => {
    const n = $$('.rv-check:checked', list).length;
    $('#reviewAddLabel').textContent = n ? `Add ${n} to my plan` : 'Nothing selected';
    $('#reviewAdd').disabled = !n;
    $$('.rv', list).forEach((r) => r.classList.toggle('off', !$('.rv-check', r).checked));
  };
  list.onchange = update;
  list.oninput = (e) => {
    const row = e.target.closest('.rv');
    if (e.target.name === 'title') $('.rv-t', row).textContent = e.target.value;
  };
  update();

  const dlg = $('#reviewDialog');
  dlg.onclose = () => {
    if (dlg.returnValue !== 'add') return;
    const now = new Date().toISOString();
    const chosen = $$('.rv', list)
      .filter((r) => $('.rv-check', r).checked)
      .map((r) => {
        const c = candidates[r.dataset.i];
        const v = (n) => $(`[name=${n}]`, r).value.trim();
        const due = fromLocalInput(v('due'));
        return sanitizeItem({
          id: newId(), title: v('title') || c.title, module: v('module'), due,
          // If the date was edited by hand, the time is now the user's, not a guess.
          timeKnown: due !== c.due ? true : c.timeKnown,
          estMins: hoursToMinutes(v('hours')) ?? c.estMins, doneMins: 0, weight: c.weight ?? null,
          kind: source === 'pdf' ? 'deadline' : 'task', type: c.kind || null, source, done: false, createdAt: now,
        });
      })
      .filter(Boolean);
    if (!chosen.length) return;
    commit(null, () => state.items.push(...chosen));
    const planned = chosen.reduce((n, c) => n + blocksFor(c.id).length, 0);
    toast(`Added ${chosen.length}. ${planned} work session${planned === 1 ? '' : 's'} planned around your classes.`, { undoable: true });
  };
  dlg.returnValue = '';
  dlg.showModal();
}

// Add screen
function setMode(mode) {
  $$('.choice').forEach((c) => c.setAttribute('aria-selected', String(c.dataset.mode === mode)));
  ['voice', 'type', 'pdf'].forEach((m) => ($(`#panel-${m}`).hidden = m !== mode));
}
$$('.choice').forEach((c) => (c.onclick = () => setMode(c.dataset.mode)));

function thoughtsToReview(text, source) {
  if (!text.trim()) return toast('Say or type something first.', { iconName: 'mic' });
  const found = parseThoughts(text, { ref: new Date(), modules: modules() });
  if (!found.length) return toast('No tasks found. Try “read chapter 4 by Friday”.', { iconName: 'alert' });
  openReview(found, { heading: `${found.length} task${found.length === 1 ? '' : 's'} found`, source });
}
$('#typeParseBtn').onclick = () => thoughtsToReview($('#typeText').value, 'typed');
$('#voiceParseBtn').onclick = () => { stopMic(); thoughtsToReview($('#voiceText').value, 'voice'); };

// Voice (Web Speech API: Chrome / Edge)
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
let recording = false;
let finalText = '';
function setMic(on) {
  recording = on;
  $('#micBtn').setAttribute('aria-pressed', String(on));
  $('#micLabel').textContent = on ? 'Listening… tap to stop' : 'Tap to start talking';
}
function stopMic() { if (rec && recording) rec.stop(); }
const VOICE_ERRORS = {
  'not-allowed': 'The microphone is blocked. Allow it in the address bar, or type instead.',
  'service-not-allowed': 'Voice isn’t allowed on this page. Open it over https or localhost, or type instead.',
  'audio-capture': 'No microphone found. Plug one in, or type instead.',
  'no-speech': 'Didn’t catch anything. Try again a little closer.',
  network: 'Voice needs an internet connection in Chrome. You can type instead.',
  aborted: 'Recording stopped.',
};
if (!SpeechRecognition) {
  $('#micBtn').disabled = true;
  $('#micLabel').textContent = 'Voice needs Chrome or Edge';
  $('#micStatus').textContent = 'You can type in the box below instead.';
} else {
  $('#micBtn').onclick = () => {
    if (recording) return rec.stop();
    rec = new SpeechRecognition();
    rec.lang = 'en-GB';
    rec.continuous = true;
    rec.interimResults = true;
    finalText = $('#voiceText').value ? `${$('#voiceText').value.trim()} ` : '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += `${r[0].transcript.trim()}. `;
        else interim += r[0].transcript;
      }
      $('#voiceText').value = (finalText + interim).trim();
    };
    let failed = false;
    rec.onerror = (e) => {
      failed = true;
      $('#micStatus').textContent = VOICE_ERRORS[e.error] || `Voice stopped (${e.error}). You can type instead.`;
    };
    rec.onend = () => {
      setMic(false);
      if (failed) return;
      $('#micStatus').textContent = $('#voiceText').value.trim()
        ? 'Got it. Check the words, then turn them into tasks.'
        : 'Recording ended before anything was heard. Tap to try again.';
    };
    try {
      rec.start();
      setMic(true);
      $('#micStatus').textContent = 'Speak naturally. Pauses are fine.';
    } catch (err) {
      console.error(err);
      setMic(false);
      $('#micStatus').textContent = 'Couldn’t start the microphone. Try again, or type instead.';
    }
  };
}

// PDF / text briefs
if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
async function fileToText(file) {
  if (file.type === 'text/plain' || file.name.endsWith('.txt')) return file.text();
  if (!window.pdfjsLib) throw new Error('PDF reader did not load');
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  let text = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const { items } = await page.getTextContent();
    let lastY = null;
    for (const it of items) {
      const y = it.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) text += '\n';
      text += it.str;
      if (it.hasEOL) text += '\n';
      lastY = y;
    }
    text += '\n';
  }
  return text;
}
async function handleFiles(files) {
  const list = [...files];
  if (!list.length) return;
  const status = $('#pdfStatus');
  let all = [];
  const report = []; // one line per file, so one bad file never hides what happened to the others
  for (const [n, file] of list.entries()) {
    status.textContent = `Reading ${file.name}${list.length > 1 ? ` (${n + 1} of ${list.length})` : ''}…`;
    try {
      const text = await fileToText(file);
      if (!text.trim()) { report.push(`${file.name}: no selectable text (it may be a scan).`); continue; }
      const found = extractDeadlines(text, {
        ref: new Date(), modules: modules(), fileName: file.name, moduleHint: $('#pdfModule').value.trim(),
      });
      report.push(`${file.name}: ${found.length ? `${found.length} found.` : 'no upcoming dates.'}`);
      all = all.concat(found);
    } catch (err) {
      console.error(err);
      report.push(`${file.name}: couldn’t be read. Is it a PDF?`);
    }
  }
  $('#pdfInput').value = '';
  const problems = report.filter((r) => !/found\.$/.test(r));
  status.textContent = all.length
    ? (problems.length ? problems.join(' ') : '')
    : `${report.join(' ')} You can add deadlines by hand on the Path screen.`;
  if (!all.length) return;
  const names = list.length === 1 ? list[0].name : `${list.length} files`;
  openReview(all, { heading: `${all.length} deadline${all.length === 1 ? '' : 's'} found in ${names}`, source: 'pdf' });
}
$('#pdfInput').onchange = (e) => handleFiles(e.target.files);
const dz = $('#dropzone');
['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
dz.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

// Class sheet
function openClassDialog(cls) {
  const dlg = $('#classDialog');
  const f = $('#classForm');
  $('#classDialogTitle').textContent = cls ? 'Edit class' : 'Add a class';
  $('#classDelete').hidden = !cls;
  $('#classError').textContent = '';
  const v = cls || { module: '', type: 'Lecture', day: weekdayIndex(selectedDate), start: '10:00', end: '11:00', location: '' };
  f.module.value = v.module;
  f.type.value = v.type;
  f.day.value = String(v.day);
  f.start.value = v.start;
  f.end.value = v.end;
  f.location.value = v.location || '';
  dlg.returnValue = '';
  dlg.onclose = () => {
    if (dlg.returnValue === 'delete' && cls) {
      commit(`Removed ${cls.module} ${cls.type.toLowerCase()}.`, () => { state.classes = state.classes.filter((c) => c.id !== cls.id); }, { toastIcon: 'trash' });
    } else if (dlg.returnValue === 'save') {
      const data = sanitizeClass({ id: cls?.id, module: f.module.value, type: f.type.value, day: f.day.value, start: f.start.value, end: f.end.value, location: f.location.value });
      if (!data) return toast('That class couldn’t be saved. Check the name and times.', { iconName: 'alert' });
      const clash = overlappingClasses(data, state.classes)[0];
      const note = clash ? ` It overlaps ${clash.module} ${clash.start}–${clash.end}; both are kept.` : '';
      commit(`${cls ? 'Class updated. Work moved around it.' : `Added ${data.module}. Work now avoids it.`}${note}`, () => {
        if (cls) Object.assign(cls, data);
        else state.classes.push(data);
      });
    }
  };
  dlg.showModal();
}
$('#classForm').addEventListener('submit', (e) => {
  const f = e.target;
  if (e.submitter?.value === 'save' && toMinutes(f.end.value) <= toMinutes(f.start.value)) {
    e.preventDefault();
    $('#classError').textContent = 'The end time needs to be after the start time.';
  }
});
$('#addClassBtn').onclick = () => openClassDialog(null);

// Item sheet
function openItemDialog(item) {
  const dlg = $('#itemDialog');
  const f = $('#itemForm');
  $('#itemDialogTitle').textContent = item ? 'Edit' : 'Add a deadline';
  $('#itemDelete').hidden = !item;
  f.title.value = item?.title || '';
  f.module.value = item?.module || '';
  f.due.value = toLocalInput(item?.due);
  f.hours.value = item ? +(item.estMins / 60).toFixed(2) : 1;
  f.weight.value = item?.weight ?? '';
  dlg.returnValue = '';
  dlg.onclose = () => {
    if (dlg.returnValue === 'delete' && item) {
      commit(`Deleted “${item.title}”.`, () => { state.items = state.items.filter((i) => i.id !== item.id); }, { toastIcon: 'trash' });
    } else if (dlg.returnValue === 'save') {
      const due = fromLocalInput(f.due.value);
      const clean = sanitizeItem({
        ...(item || { id: newId(), doneMins: 0, done: false, source: 'manual', createdAt: new Date().toISOString() }),
        title: f.title.value, module: f.module.value, due,
        timeKnown: item && due === item.due ? item.timeKnown : true,
        estMins: hoursToMinutes(f.hours.value) ?? item?.estMins ?? 60,
        weight: f.weight.value, kind: item?.kind || (due ? 'deadline' : 'task'),
      });
      if (!clean) return toast('That couldn’t be saved. It needs a name.', { iconName: 'alert' });
      commit(item ? `Updated “${clean.title}”.` : `Added “${clean.title}”.`, () => {
        if (item) Object.assign(item, clean);
        else state.items.push(clean);
      });
    }
  };
  dlg.showModal();
}
$('#addItemBtn').onclick = () => openItemDialog(null);

// Week controls
$('#prevWeek').onclick = () => { selectedDate.setDate(selectedDate.getDate() - 7); selectedDate = new Date(selectedDate); renderWeek(); };
$('#nextWeek').onclick = () => { selectedDate.setDate(selectedDate.getDate() + 7); selectedDate = new Date(selectedDate); renderWeek(); };
function fillHourSelect(sel, from, to, value) {
  sel.innerHTML = '';
  for (let h = from; h <= to; h++) sel.add(new Option(h === 24 ? '24:00' : `${pad(h)}:00`, h, false, h === value));
}
const hourLabel = (h) => (h === 24 ? 'midnight' : `${pad(h)}:00`);
function syncHourSelects() {
  fillHourSelect($('#dayStart'), 0, 23, state.settings.dayStart);
  fillHourSelect($('#dayEnd'), 1, 24, state.settings.dayEnd);
}

function setHours(key, value) {
  const next = sanitizeSettings({ ...state.settings, [key]: Number(value) });
  if (next.dayEnd <= next.dayStart || next[key] !== Number(value)) {
    syncHourSelects();
    return toast('The end of your planning hours needs to be after the start.', { iconName: 'alert' });
  }
  commit(`Work will be planned between ${hourLabel(next.dayStart)} and ${hourLabel(next.dayEnd)}.`, () => { state.settings = next; }, { toastIcon: 'clock' });
}
$('#dayStart').onchange = (e) => setHours('dayStart', e.target.value);
$('#dayEnd').onchange = (e) => setHours('dayEnd', e.target.value);

// More menu
const moreBtn = $('#moreBtn');
const menu = $('#moreMenu');
const setMenu = (open) => { menu.hidden = !open; moreBtn.setAttribute('aria-expanded', String(open)); };
moreBtn.onclick = (e) => { e.stopPropagation(); setMenu(menu.hidden); };
document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target)) setMenu(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { setMenu(false); moreBtn.focus(); } });

function applyTheme() {
  const t = state.settings.theme || 'auto';
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = t;
  $('#themeLabel').textContent = `Theme: ${t === 'auto' ? 'match device' : t}`;
}
$('#themeBtn').onclick = () => {
  state.settings.theme = THEMES[(THEMES.indexOf(state.settings.theme) + 1) % THEMES.length];
  save();
  applyTheme();
};

function demoState() {
  const now = new Date();
  const at = (days, h, m = 0) => { const d = startOfDay(now); d.setDate(d.getDate() + days); d.setHours(h, m); return d.toISOString(); };
  const c = (module, type, day, start, end, location) => ({ id: newId(), module, type, day, start, end, location });
  const i = (title, module, due, estMins, extra = {}) => ({
    id: newId(), title, module, due, estMins, doneMins: 0, done: false, kind: 'deadline', type: null, source: 'demo',
    createdAt: now.toISOString(), timeKnown: true, weight: null, ...extra,
  });
  return {
    settings: { ...state.settings, dayStart: 9, dayEnd: 21 },
    classes: [
      c('Macroeconomics', 'Lecture', 0, '10:00', '12:00', 'S0.21'),
      c('Statistics', 'Seminar', 0, '14:00', '15:00', 'R1.15'),
      c('Microeconomics', 'Lecture', 1, '09:00', '11:00', 'L3'),
      c('Maths for Economists', 'Lecture', 1, '13:00', '14:00', 'MS.01'),
      c('Macroeconomics', 'Seminar', 2, '11:00', '12:00', 'S1.66'),
      c('Maths for Economists', 'Workshop', 3, '10:00', '12:00', 'MS.02'),
      c('Microeconomics', 'Seminar', 3, '15:00', '16:00', 'S2.79'),
      c('Statistics', 'Lecture', 4, '09:00', '10:00', 'OC0.03'),
      c('Macroeconomics', 'Lecture', 4, '12:00', '13:00', 'S0.21'),
    ],
    items: [
      i('Fiscal policy essay', 'Macroeconomics', at(19, 12), 360, { weight: 30, type: 'essay', doneMins: 60 }),
      i('Problem set 3', 'Statistics', at(4, 17), 90, { weight: 10, type: 'problem set' }),
      i('Slides for Friday’s seminar', 'Microeconomics', at(6, 9), 60, { kind: 'task', type: 'presentation' }),
      i('Read chapter 4', 'Microeconomics', null, 45, { kind: 'task' }),
    ],
  };
}
$('#demoBtn').onclick = () => { setMenu(false); commit('Demo week loaded.', () => { state = sanitizeState(demoState()); }, { toastIcon: 'sparkle' }); syncHourSelects(); };
$('#resetBtn').onclick = () => {
  setMenu(false);
  if (!state.items.length && !state.classes.length) return toast('Nothing to clear.', { iconName: 'check' });
  commit('Classes and deadlines cleared. Your settings are kept. Undo if that was a mistake.', () => {
    state = { ...blankState(), settings: state.settings };
  }, { toastIcon: 'trash' });
};

const focusKey = () => { const b = focusBlock(plan.blocks, new Date()); return b ? `${b.itemId}|${b.start.getTime()}|${b.start <= new Date()}` : ''; };
let lastFocusKey = '';
function refreshIfChanged() {
  if (document.hidden || document.querySelector('dialog[open]') || pendingCompletion) return;
  const before = lastFocusKey;
  plan = buildPlan({ classes: state.classes, items: state.items, now: new Date(), dayStart: state.settings.dayStart, dayEnd: state.settings.dayEnd });
  lastFocusKey = focusKey();
  if (lastFocusKey !== before) render();
}

setInterval(refreshIfChanged, 30e3);
document.addEventListener('visibilitychange', refreshIfChanged);

hydrateIcons();
syncHourSelects();
applyTheme();
setMode('voice');
route();
render();
lastFocusKey = focusKey();
