// Bold line icons (2.4px stroke)
const P = {
  loop: '<path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="17" rx="3"/><path d="M16 2.5v4M8 2.5v4M3 10h18"/>',
  flag: '<path d="M5 22V3.5"/><path d="M5 4h13l-2.5 4.5L18 13H5"/>',
  dots: '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
  sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 17v4M17 19h4"/>',
  moon: '<path d="M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a6.6 6.6 0 0 0 9.7 9.7z"/>',
  trash: '<path d="M3.5 6h17M9 6V3.5h6V6M6 6l1 14.5h10L18 6"/>',
  mic: '<rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5"/>',
  keyboard: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M6.5 9.5h.01M10.5 9.5h.01M14.5 9.5h.01M18 9.5h.01M7 14.5h10"/>',
  file: '<path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z"/><path d="M14 2.5V8h5.5M8.5 13h7M8.5 17h4.5"/>',
  upload: '<path d="M12 16V4M6.5 9.5 12 4l5.5 5.5M4 20.5h16"/>',
  arrow: '<path d="M4.5 12h15M13.5 6l6 6-6 6"/>',
  left: '<path d="M15 5.5 8.5 12l6.5 6.5"/>',
  right: '<path d="M9 5.5 15.5 12 9 18.5"/>',
  chev: '<path d="M6 9.5l6 6 6-6"/>',
  check: '<path d="M4.5 12.5l5 5L19.5 7"/>',
  checkCircle: '<circle cx="12" cy="12" r="9.5"/><path d="M7.5 12.3l3 3 6-6.3"/>',
  undo: '<path d="M9 14.5 4 9.5l5-5"/><path d="M4 9.5h11a5 5 0 0 1 0 10h-3"/>',
  book: '<path d="M2.5 5H9a3 3 0 0 1 3 3v12a2.2 2.2 0 0 0-2.2-2H2.5z"/><path d="M21.5 5H15a3 3 0 0 0-3 3v12a2.2 2.2 0 0 1 2.2-2h7.3z"/>',
  pencil: '<path d="M4 20h4L19.2 8.8a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  clock: '<circle cx="12" cy="12" r="9.5"/><path d="M12 7v5l3.5 2"/>',
  skip: '<path d="M4.5 5.5 11 12l-6.5 6.5M12.5 5.5 19 12l-6.5 6.5"/>',
  alert: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.3h.01"/>',
  coffee: '<path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 10.5h1.5a2.8 2.8 0 0 1 0 5.6H16M8 3v3M12 3v3"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.5M12 19.5V22M4.2 4.2 6 6M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8"/>',
  pin: '<path d="M12 21.5s-7-6.3-7-12a7 7 0 0 1 14 0c0 5.7-7 12-7 12z"/><circle cx="12" cy="9.5" r="2.5"/>',
  percent: '<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
  present: '<path d="M2.5 4h19M4 4v10.5h16V4M12 14.5V18M8 21.5l4-3.5 4 3.5"/>',
  grid: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M3.5 9.5h17M3.5 15h17M9.5 3.5v17"/>',
  layers: '<path d="M12 3 2.5 8 12 13l9.5-5z"/><path d="M2.5 12.5 12 17.5l9.5-5M2.5 17 12 22l9.5-5"/>',
  dot: '<circle cx="12" cy="12" r="3.2" fill="currentColor"/>',
};

export const icon = (name, cls = '') =>
  `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${P[name] || ''}</svg>`;

// Fill any <span data-icon="name"> placeholders in static HTML. 
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    if (!el.firstElementChild || el.firstElementChild.tagName !== 'svg') el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon));
  });
}

export function kindIcon(kind, isTask) {
  if (isTask) return 'pencil';
  return { essay: 'file', report: 'file', coursework: 'file', dissertation: 'layers', exam: 'target', test: 'target',
    presentation: 'present', 'problem set': 'grid' }[kind] || 'flag';
}
