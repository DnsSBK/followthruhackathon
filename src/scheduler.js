// Places unfinished work into free time around classes. Earliest deadline first.

const MIN = 60e3;

// Monday = 0 ... Sunday = 6 
export const weekdayIndex = (d) => (d.getDay() + 6) % 7;

export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function startOfWeek(d) {
  const x = startOfDay(d);
  x.setDate(x.getDate() - weekdayIndex(x));
  return x;
}

export const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

/**
 * @param {object} p
 * @param {Array} p.classes  {day 0-6, start 'HH:MM', end 'HH:MM'}
 * @param {Array} p.items    {id, due ISO|null, estMins, doneMins, done, snoozeUntil ISO|null, createdAt}
 * @returns {{blocks: Array, risks: Object<string, number>}}  risks = minutes that won't fit before the deadline
 */
export function buildPlan({
  classes = [],
  items = [],
  now = new Date(),
  horizonDays = 21,
  dayStart = 9,
  dayEnd = 21,
  slotMins = 30,
  maxBlockMins = 90,
  maxTaskMinsPerDay = 180,
} = {}) {
  //Free 30-minute slots
  const firstSlot = Math.ceil(now.getTime() / (slotMins * MIN)) * slotMins * MIN;
  const slots = [];
  for (let d = 0; d < horizonDays; d++) {
    const day = startOfDay(now);
    day.setDate(day.getDate() + d);
    const busy = classes
      .filter((c) => Number(c.day) === weekdayIndex(day))
      .map((c) => [toMinutes(c.start), toMinutes(c.end)]);
    for (let m = dayStart * 60; m + slotMins <= dayEnd * 60; m += slotMins) {
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, m).getTime();
      if (start < firstSlot) continue;
      if (busy.some(([bs, be]) => m < be && m + slotMins > bs)) continue;
      slots.push({ start, end: start + slotMins * MIN, day: d, taken: false });
    }
  }
  const contiguous = (a, b) => a && b && a.day === b.day && a.end === b.start;

  //Work queue:
  const queue = items
    .filter((it) => !it.done && (it.estMins || 0) - (it.doneMins || 0) > 0)
    .sort((a, b) => {
      const da = a.due ? new Date(a.due).getTime() : Infinity;
      const db = b.due ? new Date(b.due).getTime() : Infinity;
      return da - db || new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    });

  //Fill slots.
  const blocks = [];
  const risks = {};
  for (const item of queue) {
    let remaining = item.estMins - (item.doneMins || 0);
    const due = item.due ? new Date(item.due).getTime() : Infinity;
    const notBefore = item.snoozeUntil ? new Date(item.snoozeUntil).getTime() : 0;
    const usedPerDay = {};
    const mine = [];
    let i = 0;
    while (remaining > 0 && i < slots.length) {
      const s = slots[i];
      if (s.end > due) break;
      const dayLeft = maxTaskMinsPerDay - (usedPerDay[s.day] || 0);
      if (s.taken || s.start < notBefore || dayLeft < slotMins) { i++; continue; }
      const want = Math.min(Math.ceil(remaining / slotMins) * slotMins, maxBlockMins, dayLeft);
      let j = i + 1;
      while (
        j < slots.length && (j - i + 1) * slotMins <= want &&
        !slots[j].taken && contiguous(slots[j - 1], slots[j]) && slots[j].end <= due
      ) j++;
      const mins = (j - i) * slotMins;
      if (!item.due && mins < Math.min(want, 60)) { i++; continue; }
      for (let k = i; k < j; k++) slots[k].taken = true;
      mine.push({ itemId: item.id, start: new Date(s.start), end: new Date(slots[j - 1].end) });
      remaining -= mins;
      usedPerDay[s.day] = (usedPerDay[s.day] || 0) + mins;
      if (mins >= 60 && contiguous(slots[j - 1], slots[j])) slots[j].taken = true;
      i = j + 1;
    }
    mine.forEach((b, n) => blocks.push({ ...b, part: n + 1, parts: mine.length }));
    if (remaining > 0 && item.due) risks[item.id] = remaining;
  }
  blocks.sort((a, b) => a.start - b.start);
  return { blocks, risks };
}

export function focusBlock(blocks, now = new Date()) {
  return blocks.find((b) => b.end > now) || null;
}
