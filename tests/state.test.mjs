import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeState, sanitizeItem, sanitizeClass, sanitizeSettings, hoursToMinutes, overlappingClasses } from '../src/state.js';
import { MAX_MINUTES } from '../src/parser.js';

test('garbage or nothing loads as an empty, usable state', () => {
  for (const raw of [null, undefined, 42, 'x', [], { classes: 'no', items: {} }]) {
    const s = sanitizeState(raw);
    assert.deepEqual(s.classes, []);
    assert.deepEqual(s.items, []);
    assert.equal(s.settings.dayStart, 9);
  }
});

test('invalid classes are dropped', () => {
  assert.equal(sanitizeClass({ module: 'Stats', day: 0, start: '10:00', end: '09:00' }), null, 'ends before it starts');
  assert.equal(sanitizeClass({ module: 'Stats', day: 9, start: '10:00', end: '11:00' }), null, 'no such day');
  assert.equal(sanitizeClass({ module: '', day: 0, start: '10:00', end: '11:00' }), null, 'no name');
  assert.equal(sanitizeClass({ module: 'Stats', day: '2', start: '10:00', end: '11:00' }).day, 2);
});

test('item values are clamped and repaired', () => {
  const it = sanitizeItem({ title: ' Essay ', estMins: 1e9, doneMins: -5, due: 'not a date', weight: 140 });
  assert.equal(it.title, 'Essay');
  assert.equal(it.estMins, MAX_MINUTES);
  assert.equal(it.doneMins, 0);
  assert.equal(it.due, null);
  assert.equal(it.weight, null);
  assert.equal(sanitizeItem({ title: '' }), null);
  assert.equal(sanitizeItem({ title: 'x', estMins: 60, doneMins: 90 }).doneMins, 60, 'progress cannot pass the estimate');
});

test('duplicate ids are dropped', () => {
  const s = sanitizeState({ items: [{ id: 'a', title: 'one' }, { id: 'a', title: 'two' }] });
  assert.equal(s.items.length, 1);
});

test('settings: hours in range, end after start, known themes only', () => {
  assert.deepEqual(sanitizeSettings({ dayStart: 22, dayEnd: 3, theme: 'neon' }), { dayStart: 9, dayEnd: 21, theme: 'auto' });
  assert.deepEqual(sanitizeSettings({ dayStart: 0, dayEnd: 24, theme: 'dark' }), { dayStart: 0, dayEnd: 24, theme: 'dark' });
  assert.equal(sanitizeSettings({ dayStart: 'abc' }).dayStart, 9);
});

test('hours typed into forms', () => {
  assert.equal(hoursToMinutes('1.5'), 90);
  assert.equal(hoursToMinutes('-2'), null);
  assert.equal(hoursToMinutes(''), null);
  assert.equal(hoursToMinutes('Infinity'), null);
});

test('overlapping classes are detected on the same day only', () => {
  const a = { id: 'a', day: 0, start: '10:00', end: '12:00' };
  assert.equal(overlappingClasses({ id: 'b', day: 0, start: '11:00', end: '13:00' }, [a]).length, 1);
  assert.equal(overlappingClasses({ id: 'b', day: 0, start: '12:00', end: '13:00' }, [a]).length, 0);
  assert.equal(overlappingClasses({ id: 'b', day: 1, start: '11:00', end: '13:00' }, [a]).length, 0);
});
