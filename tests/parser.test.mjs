import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractDeadlines, parseThoughts, estimateMinutes, detectModule, isPast, clampMinutes, MAX_MINUTES } from '../src/parser.js';

const ref = new Date('2026-10-24T17:40:00'); // a Saturday
const day = (iso) => new Date(iso).toDateString();

test('deadlines: picks the date after "due", not the release date', () => {
  const [d] = extractDeadlines('Essay released on 1 November 2026 and due on 20 November 2026 at 5pm.', { ref });
  assert.equal(day(d.due), day('2026-11-20T00:00'));
  assert.equal(new Date(d.due).getHours(), 17);
  assert.ok(d.flags.includes('several-dates'));
});

test('deadlines: missing time defaults to 12:00 and is flagged', () => {
  const [d] = extractDeadlines('Problem Set 2 is due on 27/11/2026.', { ref });
  assert.equal(new Date(d.due).getHours(), 12);
  assert.equal(d.timeKnown, false);
  assert.ok(d.flags.includes('time-guessed'));
});

test('deadlines: UK date order (14/11 is 14 November)', () => {
  const [d] = extractDeadlines('Report due 14/11/2026 at 9am.', { ref });
  assert.equal(day(d.due), day('2026-11-14T00:00'));
});

test('deadlines: past is judged by calendar day when the time is a guess', () => {
  assert.equal(isPast(new Date('2026-10-24T12:00'), false, ref), false, 'earlier today, guessed time: keep');
  assert.equal(isPast(new Date('2026-10-24T12:00'), true, ref), true, 'earlier today, stated time: past');
  assert.equal(isPast(new Date('2026-10-23T23:00'), false, ref), true, 'yesterday: past');
  assert.equal(extractDeadlines('Essay due 1 October 2026.', { ref }).length, 0);
});

test('deadlines: ignores weekly classes, optional items and non-deadline dates', () => {
  const text = [
    'Lectures run every Monday at 10am.',
    'An optional essay plan can be sent for informal feedback by 13 November 2026.',
    'Reading week runs from 9 to 13 November 2026.',
    'Marks are released by 18 December 2026.',
  ].join('\n');
  assert.deepEqual(extractDeadlines(text, { ref }), []);
});

test('deadlines: table rows lose the percentage from the title but keep the weighting', () => {
  const [d] = extractDeadlines('Problem Set 1 10% Friday 6 November 2026, 12:00', { ref });
  assert.equal(d.title, 'Problem Set 1');
  assert.equal(d.weight, 10);
});

test('deadlines: vague sentence takes its name from the heading above and says so', () => {
  const text = 'Group presentation\nPrepare a talk on a market of your choice.\nSlides must be submitted by 9am on Monday 30 November 2026.';
  const [d] = extractDeadlines(text, { ref });
  assert.equal(d.title, 'Group presentation');
  assert.ok(d.flags.includes('title-guessed'));
});

test('deadlines: lines wrapped by a PDF are rejoined', () => {
  const text = 'The essay must be uploaded to the portal no later than\n12 noon on Friday 20 November 2026.';
  assert.equal(extractDeadlines(text, { ref }).length, 1);
});

test('tasks: splits a brain dump and keeps meaningful mid-sentence dates in titles', () => {
  const tasks = parseThoughts("need to prep 3 slides for Friday's seminar and read chapter 4, also email my tutor by Monday", { ref });
  assert.deepEqual(tasks.map((t) => t.title), ["Prep 3 slides for Friday's seminar", 'Read chapter 4', 'Email my tutor']);
  assert.deepEqual(tasks.map((t) => t.estMins), [60, 45, 10]);
});

test('tasks: the date after "by" wins over a date mentioned in passing', () => {
  const [t] = parseThoughts('email my tutor about the Friday seminar by Monday', { ref });
  assert.equal(new Date(t.due).getDay(), 1);
});

test('tasks: "today" with no time is due tonight, not at 09:00 this morning', () => {
  const [t] = parseThoughts('email my tutor today', { ref });
  assert.equal(day(t.due), day(ref));
  assert.equal(new Date(t.due).getHours(), 23);
});

test('tasks: the same thing said twice becomes one task', () => {
  const tasks = parseThoughts('read chapter 4. oh and read chapter 4', { ref });
  assert.equal(tasks.length, 1);
});

test('estimates: first matching rule wins, in a deliberate order', () => {
  assert.equal(estimateMinutes('email my tutor about the essay'), 10);
  assert.equal(estimateMinutes('write the essay intro for 2 hours'), 120);
  assert.equal(estimateMinutes('read chapters 2 to 4'), 135);
  assert.equal(estimateMinutes('do laundry'), 30);
});

test('estimates: absurd numbers are clamped', () => {
  assert.equal(estimateMinutes('revise for 900 hours'), MAX_MINUTES);
  assert.equal(clampMinutes(-20), 5);
  assert.equal(clampMinutes(NaN), 30);
});

test('modules: whole-word matching, longest name first', () => {
  assert.equal(detectModule('mow the lawn', ['Law']), '');
  assert.equal(detectModule('Law essay', ['Law']), 'Law');
  assert.equal(detectModule('Maths for Economists problem sheet', ['Maths', 'Maths for Economists']), 'Maths for Economists');
});
