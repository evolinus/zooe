# Room guides

The printable step-by-step guide for every room of the two laboratory apps.
One plain-text source per room here; one PDF per room in
`teaching/<app>/guides/`, which is what the rooms link and what gets published.
This folder is not: Jekyll skips anything under an underscore.

```bash
python3 _guides/build.py            # every guide, both apps (about 20 s)
python3 _guides/build.py drift      # only sources whose name contains "drift"
python3 _guides/build.py --html     # write the HTML to the temp folder instead
```

It needs Python 3 and Google Chrome (or Chromium), nothing else. Chrome prints
the PDFs headless from HTML the script writes, styled by `guide.css`.

**Edit the `.txt`, then rebuild, then commit the PDFs too.** CI does not build
them; the PDFs in `teaching/` are the published copy.

The build also writes each guide's times into its room: the *Start here* panel
of every room carries `core path N min · MSc extension +M min` in a
`<span class="room-guide-time" data-guide="…">`, and that text is rewritten from
the step times on every build. A guide with no such span is reported. The
*Predict first* line and the *Questions to discuss* block in each room are
hand-written in the app's `index.html`, not generated from here.

## The source format

`00-overview.txt` is the app's one overview page; its table of rooms is built
from the room sources, so only its prose lives in it. Every other `NN-name.txt`
is one room, and its file name is the PDF's.

Header lines first, `key: value`:

| key | what it is |
|---|---|
| `id` | the room's tab id (`drifting`); in the Evolutionary Laboratories the guide links straight to `#id` |
| `num`, `title`, `kicker` | as on the room's README entry |
| `part` | the README's part heading; the overview groups rooms by it |
| `focus` | one sentence for the overview table |
| `colour` | the room's `--tab` colour |
| `before` | which rooms to have done first |

Then sections, each opened by `# kind`:

- `# intro` — paragraphs under the masthead.
- `# objectives core`, `# objectives ext` — bulleted (`- `) learning objectives.
- `# routes` — bulleted suggested routes.
- `# step core 10 | Title` or `# step ext 12 | Title` — one step; the number is
  its minutes, and the path totals are summed from these. Fields, each optional:
  `set:` (setup), `predict:`, `run:`, `look:`, `explain:`, `note:`; `plines:` and
  `elines:` set how many answer lines follow the prediction and the explanation
  (2 and 3 by default). All core steps come before all extension steps.
- `# questions` — bulleted, each starting `[core]` or `[ext]`.
- `# check` — bulleted notes for *Checking your reasoning*, which always starts
  on a page of its own so it can be left out of a class printout.

A line indented two spaces continues the line above. Inline: `**bold**`,
`*italic*`, `$N$` for a variable (with `$H_t$`, `$H_{t+1}$`, `$x^2$` for sub- and
superscripts), straight quotes become curly, and plain HTML (`<sub>`, `&amp;`)
passes through. British spelling.

Every number in a `# check` note was worked out from the room's own model, or
read off the room's own *Exactly what this room simulates*. Keep it that way:
change a room's defaults and its guide's predictions may need to change too.
