# followthru.ai

A study planner for neurodivergent students that runs itself. Drop in briefs or voice notes; followthru.ai finds deadlines, shows one next task, and reschedules without shame.

## Run it

It's a static site with no build step and no API keys. It also works offline, because the libraries are in `vendor/`.

```bash
cd followthru
python3 -m http.server 3000      # or: npx serve -l 3000 .
```

Open **http://localhost:3000** in **Chrome or Edge**. Voice capture uses the browser's speech recognition, which only those two support. You need `localhost` or `https`, not a double-clicked file, because the page uses ES modules and the microphone.

To deploy, drag the folder onto Netlify Drop, or push it to GitHub Pages or Vercel. Any static host works.

## Design

The interface is built to keep the sensory and cognitive load low:

- **One job per screen.** **Now** shows a single task. **Add** has three big choices, and only the one you pick opens. **Week** shows one day at a time. **Path** shows the next 3 deadlines, and the rest stay behind "Show more".
- **Low-glare colours.** The base is warm oatmeal, or soft dark with a sage tint. Nothing is pure white. A single coral accent is used only for the main action on each screen.
- **Icons and words together.** Every status pairs a bold icon with a label (Class, Planned work, Deadline, "won't fit"). Colour is never the only signal.
- **Stepping stones, not a to-do wall.** Each deadline is a row of stones, one per hour of work: filled for done, a ring for next, faint for later.
- **Details on request.** Weightings, rooms, edit fields and the source text sit behind toggles.
- **Calm, predictable motion.** Finishing a session strikes the title through, turns the button into a check, then fades in the next task. Messages float over the page and never push content around. There's no infinite scroll and nothing plays by itself. If your device asks for reduced motion, all motion is off.
- **Contrast.** All text meets WCAG AA in both themes, and most meets AAA.

## What's in it

| Screen | What it does |
|---|---|
| **Now** | Shows the next work session in very large type. *Done* logs the step, *Not now* moves it an hour later and says where it went, and *The whole thing's finished* closes the task. "What's after this?" reveals the next 3 sessions. |
| **Add → Say it** | Live transcription (Web Speech API, en-GB). Your words are split into tasks with time estimates and dates. |
| **Add → Type it** | The same parser, typed instead of spoken. |
| **Add → Drop a file** | pdf.js extracts the text, then deadlines, weightings and types are found with UK date parsing (`chrono-node`). Weekly lectures are ignored. If no time is given, it assumes 12:00 and says so. |
| **Check sheet** | Nothing parsed goes in until you've checked it. Tap a row to leave it out, or open Edit to fix it. |
| **Week** | Pick a day to see its classes, planned work and deadlines in time order. Tap any row to edit it. Planning hours sit behind a toggle. |
| **Path** | Deadlines as stepping stones, earliest first. If the work won't fit, an icon and plain words say how much is short and what to do next. |
| **Scheduler** | Earliest deadline first, in 30-minute slots, at most 90 minutes per session, a 30-minute break after an hour, and at most 3 hours per task per day. |
| **Undo** | Every change shows a message with an Undo button. |

The ••• menu has the demo week, a theme switch (device, light or dark) and Clear everything. Everything is saved in the browser (`localStorage`).

## Tests

```bash
npm install   # once, for chrono-node
npm test      # 33 tests, Node 22+, runs in UK time so the October clock change is covered
```

## Files

```
index.html          page structure + dialogs
src/style.css       calm theme, light/dark, mobile
src/app.js          state, screens, voice, PDF reading, sheets
src/icons.js        bold line icons (inline SVG)
src/parser.js       text → deadlines / tasks (pure functions, testable in Node)
src/scheduler.js    tasks + classes → planned sessions (pure function)
src/state.js        validation for saved data and form values (pure functions)
tests/              node:test suites: parser, scheduler, validation, parse→plan integration
vendor/             chrono-node bundle + pdf.js (offline)
samples/            macro-handbook.pdf for the demo
```

## 60-second demo script

1. Open the **•••** menu and choose **Load a demo week**. Point out that the Now screen shows only one thing.
2. Go to **Add → Drop a file** and drop `samples/macro-handbook.pdf`. Five deadlines appear with weightings, and the weekly lectures are correctly ignored. Click **Add 5 to my plan**.
3. Go to **Add → Say it** and say *"need to prep three slides on fiscal policy for Friday's seminar and read chapter four, also email my tutor by Monday."* Click **Turn into tasks**, then **Add**.
4. Go to **Now** and click **Done**. The title strikes through and the next task fades in.
5. Click **Not now**. It moves, and the message says exactly where. Click **Undo**.
6. Go to **Path** to show the deadlines as stepping stones.

The sample PDF's dates run from November 2026 to January 2027. `samples/microeconomics-assessment-brief.pdf` is a second, harder example: a table, wrapped sentences and distractor dates (weekly lectures, reading week, an optional essay plan, feedback dates) that should all be ignored. Regenerate it with `python3 build/make_example_pdf.py`.

## Known limits (be upfront if judges ask)

- **Voice works in Chrome and Edge only.** Chrome sends the audio to Google's speech service to transcribe it. You can't upload an audio file yet, because that needs a speech-to-text API such as Whisper.
- **Parsing is rule-based, not an LLM.** It's fast, free and predictable, but it can miss unusual phrasings. That's why the review screen exists.
- **Scanned PDFs** have no text to read. The app says so, and you can add those deadlines by hand.
- **Data stays in this one browser.** There are no accounts and no sync.

## Next steps

- **AI parsing:** put an LLM call behind `extractDeadlines` and `parseThoughts` in `src/parser.js`, and keep the rule-based version as a fallback. The review screen already handles whatever comes back. Do it through a small server so your API key isn't in the browser.
- **Calendar import:** read the `.ics` file from your university timetable instead of adding classes by hand.
- **Learning estimates:** compare the time actually logged with the estimates and adjust future ones.
