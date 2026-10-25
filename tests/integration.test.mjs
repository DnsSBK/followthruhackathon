// Parser -> validation -> scheduler together: a small parsing mistake can derail the whole week,
// so check the pieces agree on deadlines, effort and progress.
import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractDeadlines, parseThoughts } from '../src/parser.js';
import { sanitizeItem } from '../src/state.js';
import { buildPlan } from '../src/scheduler.js';

const ref = new Date('2026-10-24T17:40:00');
const handbook = `Microeconomics 1 – Assessment Brief
Lectures run every Tuesday at 9am in the main lecture theatre.
Component Weighting Deadline
Problem Set 1 10% Friday 6 November 2026, 12:00
Market power essay 30% Friday 20 November 2026, 12:00
In-class test 10% Wednesday 2 December 2026, 10:00
Problem Set 2 10% Friday 11 December 2026, 12:00
Final exam 40% Summer exam period (date TBC)`;

const toItems = (cands, kind) => cands.map((c, i) => sanitizeItem({ ...c, id: `${kind}${i}`, kind, doneMins: 0, createdAt: ref.toISOString() }));

test('handbook -> items -> plan: every deadline is fully planned before it is due, or flagged', () => {
  const found = extractDeadlines(handbook, { ref, modules: ['Microeconomics'] });
  assert.deepEqual(found.map((d) => d.title), ['Problem Set 1', 'Market power essay', 'In-class test', 'Problem Set 2']);
  const items = toItems(found, 'deadline');
  assert.ok(items.every(Boolean), 'parser output passes validation unchanged');

  const { blocks, risks } = buildPlan({ items, now: ref });
  for (const it of items) {
    const planned = blocks.filter((b) => b.itemId === it.id).reduce((n, b) => n + (b.end - b.start) / 6e4, 0);
    const short = risks[it.id] || 0;
    assert.ok(planned + short >= it.estMins, `${it.title}: planned ${planned} + short ${short} < ${it.estMins}`);
    for (const b of blocks.filter((x) => x.itemId === it.id)) assert.ok(b.end <= new Date(it.due));
  }
});

test('brain dump -> plan: tasks due soon are planned first', () => {
  const tasks = toItems(parseThoughts('read chapter 4 by Friday and email my tutor by Monday', { ref }), 'task');
  const { blocks } = buildPlan({ items: tasks, now: ref });
  assert.equal(blocks[0].itemId, tasks.find((t) => t.title.startsWith('Email')).id);
});
