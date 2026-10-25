import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, focusBlock, toMinutes, weekdayIndex } from '../src/scheduler.js';

const now = new Date('2026-10-26T08:10:00'); // Monday
const classes = [
  { day: 0, start: '10:00', end: '12:00' },
  { day: 0, start: '14:00', end: '15:00' },
  { day: 1, start: '09:00', end: '17:00' },
];
const mins = (b) => (b.end - b.start) / 6e4;
const minuteOfDay = (d) => d.getHours() * 60 + d.getMinutes();

test('never plans work during a class', () => {
  const { blocks } = buildPlan({ classes, items: [{ id: 'a', estMins: 1200, due: null }], now });
  for (const b of blocks) {
    for (const c of classes.filter((x) => x.day === weekdayIndex(b.start))) {
      const overlap = minuteOfDay(b.start) < toMinutes(c.end) && toMinutes(c.start) < minuteOfDay(b.end);
      assert.ok(!overlap, `block ${b.start} overlaps a class`);
    }
  }
});

test('stays inside planning hours, never in the past, never crossing midnight', () => {
  const { blocks } = buildPlan({ items: [{ id: 'a', estMins: 3000, due: null }], now, dayStart: 9, dayEnd: 21 });
  for (const b of blocks) {
    assert.ok(b.start >= now);
    assert.ok(b.start.getHours() >= 9 && minuteOfDay(b.end) <= 21 * 60);
    assert.equal(b.start.toDateString(), new Date(b.end - 1).toDateString());
  }
});

test('earliest deadline first; nothing scheduled after its deadline', () => {
  const items = [
    { id: 'late', estMins: 60, due: '2026-11-10T12:00:00' },
    { id: 'soon', estMins: 60, due: '2026-10-27T09:00:00' },
  ];
  const { blocks } = buildPlan({ classes, items, now });
  assert.equal(blocks[0].itemId, 'soon');
  for (const b of blocks) assert.ok(b.end <= new Date(items.find((i) => i.id === b.itemId).due));
});

test('reports how many minutes will not fit before a deadline', () => {
  const { risks } = buildPlan({ classes, items: [{ id: 'tight', estMins: 120, due: '2026-10-26T11:00:00' }], now });
  assert.equal(risks.tight, 60);
});

test('sessions are at most 90 minutes and at most 3 hours per task per day', () => {
  const { blocks } = buildPlan({ items: [{ id: 'big', estMins: 900, due: null }], now });
  const perDay = {};
  for (const b of blocks) {
    assert.ok(mins(b) <= 90);
    perDay[b.start.toDateString()] = (perDay[b.start.toDateString()] || 0) + mins(b);
  }
  for (const total of Object.values(perDay)) assert.ok(total <= 180);
});

test('progress already logged is not planned again', () => {
  const { blocks } = buildPlan({ items: [{ id: 'a', estMins: 120, doneMins: 90, due: null }], now });
  assert.equal(blocks.reduce((n, b) => n + mins(b), 0), 30);
});

test('"not now" (snooze) pushes the task back; other work only ever moves earlier', () => {
  const items = [{ id: 'a', estMins: 60, due: null, createdAt: '1' }, { id: 'b', estMins: 60, due: null, createdAt: '2' }];
  const before = buildPlan({ items, now });
  const after = buildPlan({ items: [{ ...items[0], snoozeUntil: '2026-10-26T15:00:00' }, items[1]], now });
  assert.ok(after.blocks.find((b) => b.itemId === 'a').start >= new Date('2026-10-26T15:00:00'));
  assert.ok(after.blocks.find((b) => b.itemId === 'b').start <= before.blocks.find((b) => b.itemId === 'b').start);
});

test('clock change (Sun 25 Oct 2026): sessions still start at 09:00 local time', () => {
  const { blocks } = buildPlan({ items: [{ id: 'a', estMins: 600, due: null }], now: new Date('2026-10-24T20:30:00') });
  const sunday = blocks.filter((b) => b.start.getDay() === 0);
  assert.ok(sunday.length);
  assert.equal(sunday[0].start.getHours(), 9);
});

test('focus is the current or next session', () => {
  const { blocks } = buildPlan({ items: [{ id: 'a', estMins: 60, due: null }], now });
  assert.equal(focusBlock(blocks, now), blocks[0]);
  assert.equal(focusBlock(blocks, new Date(blocks[0].end.getTime() + 1)), null);
});
