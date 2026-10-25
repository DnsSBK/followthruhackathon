// Data validation. 
// saved data on load, the undo snapshot, and values typed into forms.
import { clampMinutes, newId } from './parser.js';

export const THEMES = ['auto', 'light', 'dark'];
export const DEFAULT_SETTINGS = { dayStart: 9, dayEnd: 21, theme: 'auto' };
export const blankState = () => ({ classes: [], items: [], settings: { ...DEFAULT_SETTINGS } });

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v, lo, hi, fallback) => (Number.isInteger(Number(v)) && v !== '' && v !== null && Number(v) >= lo && Number(v) <= hi ? Number(v) : fallback);

// An ISO date string that parses, or null
export function validIso(v) {
  if (typeof v !== 'string' || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Planning hours: start 0–23, end 1–24, end after start. Overnight ranges aren't supported. 
export function sanitizeSettings(raw = {}) {
  let dayStart = int(raw.dayStart, 0, 23, DEFAULT_SETTINGS.dayStart);
  let dayEnd = int(raw.dayEnd, 1, 24, DEFAULT_SETTINGS.dayEnd);
  if (dayEnd <= dayStart) ({ dayStart, dayEnd } = DEFAULT_SETTINGS);
  const theme = THEMES.includes(raw.theme) ? raw.theme : 'auto';
  return { dayStart, dayEnd, theme };
}

export function sanitizeClass(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const module = str(raw.module, 80);
  const day = int(raw.day, 0, 6, null);
  if (!module || day === null || !HHMM.test(raw.start) || !HHMM.test(raw.end) || toMin(raw.end) <= toMin(raw.start)) return null;
  return {
    id: str(raw.id, 64) || newId(), module, day, start: raw.start, end: raw.end,
    type: str(raw.type, 30) || 'Lecture', location: str(raw.location, 60),
  };
}

// A deadline or task, or null. Minutes are clamped; progress can't exceed the estimate.
export function sanitizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = str(raw.title, 140);
  if (!title) return null;
  const estMins = clampMinutes(Number(raw.estMins));
  const doneMins = Math.min(estMins, Math.max(0, Number(raw.doneMins) || 0));
  const weight = raw.weight === null || raw.weight === '' || raw.weight === undefined ? null : int(raw.weight, 0, 100, null);
  return {
    id: str(raw.id, 64) || newId(),
    title,
    module: str(raw.module, 80),
    due: validIso(raw.due),
    timeKnown: raw.timeKnown !== false,
    estMins,
    doneMins,
    weight,
    kind: raw.kind === 'task' ? 'task' : 'deadline',
    type: str(raw.type, 30) || null,
    source: str(raw.source, 20) || 'manual',
    done: raw.done === true,
    createdAt: validIso(raw.createdAt) || new Date().toISOString(),
    snoozeUntil: validIso(raw.snoozeUntil),
  };
}

export function sanitizeState(raw) {
  if (!raw || typeof raw !== 'object') return blankState();
  const seen = new Set();
  const unique = (x) => x && !seen.has(x.id) && seen.add(x.id);
  return {
    classes: (Array.isArray(raw.classes) ? raw.classes : []).map(sanitizeClass).filter(unique),
    items: (Array.isArray(raw.items) ? raw.items : []).map(sanitizeItem).filter(unique),
    settings: sanitizeSettings(raw.settings),
  };
}

export function hoursToMinutes(value) {
  const h = Number(value);
  return Number.isFinite(h) && h > 0 ? clampMinutes(h * 60) : null;
}

export function overlappingClasses(cls, classes) {
  return classes.filter((c) => c.id !== cls.id && Number(c.day) === Number(cls.day)
    && toMin(c.start) < toMin(cls.end) && toMin(cls.start) < toMin(c.end));
}
