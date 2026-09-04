# zoo_e lab website

The public site for the Zoology and Evolution lab at the University of Pavia,
live at **evolinus.github.io/zooe**. A Jekyll site built on the
[Lab Website Template](https://greene-lab.gitbook.io/lab-website-template-docs);
the template docs still describe the machinery underneath, so read them for
anything this file does not cover.

Unlike the other repos here, **this one publishes.** A push to `main` rebuilds
and redeploys the live site (see *Build and deploy* below).

## The first thing to know: the `fr-` layer

The pages are stubs. Every one of them is front matter plus a single include:

```markdown
{% include section.html size="full" %}
{% include fr-research.html %}
```

All the real markup lives in `_includes/fr-*.html`, all the real styling in
`_styles/first-run.scss` (homepage) and `_styles/fr-pages.scss` (interior
pages). `fr` is for *first run* — the design pass that replaced the template's
stock look.

So: **to change what a page says or how it looks, edit the `fr-*` include, not
the `.md`.** The `.md` files exist for their front matter — `title`, and
`nav.order`, which is what orders the tab bar.

| page | stub | markup |
|---|---|---|
| Home | `index.md` | `fr-hero`, `fr-project-index`, `fr-index-switch`, `fr-image-band` |
| Research | `research/index.md` | `fr-research.html` |
| Publications | `publications/index.md` | `fr-publications.html` |
| People | `team/index.md` | `fr-people.html` |
| Teaching | `teaching/index.md` | `fr-teaching.html` |
| Contact | `contact/index.md` | `fr-contact.html` |

`_layouts/member.html` — the individual profile pages under `/members/` — was
rewritten in the same language, so it is `fr-` markup too even though it is a
layout rather than an include.

The template's own component set is still in the repo but the site has stopped
using most of it. `card.html`, `citation.html`, `grid.html`, `list.html`,
`feature.html`, `figure.html`, `cols.html`, `alert.html`, `float.html` and
`post-excerpt.html` have no callers at all, and `button.html`, `tags.html`,
`portrait.html` and `post-info.html` are only reachable through those. What is
actually live is `section.html`, `icon.html`, `fallback.html`, `content.html`,
the `head`/`header`/`footer` chain and the search includes. Don't reach for a
stock component out of habit; look at what the neighbouring `fr-` include does.

There is a `posts` collection configured and a `post` layout, but no `_posts` —
the site has no blog.

**Two names that lie.** `fr-index-switch.html` no longer switches anything: it
is the homepage's *Recent publications* list, taken from `citations.yaml`. And
the "three-set index" handler in `_scripts/first-run.js` — the one looking for
`data-fr-switch`, `data-fr-tab` and `data-fr-set` — is dormant; no markup uses
those attributes any more.

## Content that lives in data, not markup

Prose sits inline in the `fr-*` includes. Lists sit in `_data/`:

- `_data/projects.yaml` — research projects (title, organism, method, question,
  short blurb and long description). Read by `fr-research.html` and the
  homepage project index.
- `_data/first_run.yaml` — the university courses, the school seminars and the
  closing image band on the homepage.
- `_data/alumni.yaml` — past people, grouped by the role they held.
- `_data/citations.yaml` — **generated, never edit.** See below.
- `_data/sources.yaml` — publication machinery, below.
- `_data/types.yaml` — two lookups in one file: the role a member holds
  (`role: undergrad` in their front matter) and the link kinds (`email`,
  `orcid`, `github`…), each with an icon and a URL template. Adding a new kind
  of link to a member means adding it here first.

Current people are one Markdown file each in `_members/`; `_members_past/` is
kept but not a collection, so those files generate no pages.

## Publications are generated

```
_data/sources.yaml   (hand-edited: a DOI or ISBN, plus a thumbnail)
        ↓  python _cite/cite.py   — looks each id up via the plugins in _cite/plugins
_data/citations.yaml (generated: authors, journal, date, link)
```

To add a paper, add three lines to `sources.yaml` — `id`, `title` and `image` —
and let the pipeline fill in the rest. `citations.yaml` starts with
`# DO NOT EDIT, GENERATED AUTOMATICALLY` and means it; anything written there
by hand is lost on the next run.

The lookup runs in CI on every push to `main` and weekly on a schedule, and
commits the result straight back to the branch. **After a push, `git pull`
before doing more work** — there is very often an "Update citations" commit
waiting for you.

## Build and deploy

`.github/workflows/on-push.yaml`: push to `main` → refresh citations → build
with Jekyll → commit `_site` to the `gh-pages` branch, which is what GitHub
Pages serves. Nothing else is needed to publish; there is no manual step.

That makes a push to `main` a public act. Treat unfinished work accordingly.

## The Evolutionary Laboratories snapshot

`teaching/evolutionary-laboratories/` is a **hand-copied snapshot** of the
separate `evolutionary_laboratories` repo, deliberately held at an older
version (its `main.html` is 74 KB against 199 KB upstream). Updating it is a
manual copy that is made when the newer version is ready to go public — never
as a side effect of other work here.

The homepage depends on it. `_scripts/fr-sim.js` draws the background
branching animation using `teaching/evolutionary-laboratories/js/shapes-engine.js`,
loaded by `_includes/fr-project-index.html`, so that the homepage shapes mutate
by exactly the same rules as the room they came from. Moving or pruning that
folder breaks the homepage.

## Conventions that are easy to break

**Colours and type are tokens.** Everything is defined once in
`_styles/-theme.scss` — `--primary` red, `--panel` amber, `--secondary` teal,
Archivo throughout, `--rounded: 0px` because nothing on this site is rounded
and dividers do the work instead. Use the variables; don't paste a hex into a
component. `[data-dark="true"]` in that file is not a dark theme any more — it
is what the header, the footer and dark-image sections switch to locally.

**`_styles` and `_scripts` are auto-included.** `styles.html` and `scripts.html`
loop over the whole folder, so a new `.scss` or `.js` file is live the moment
it exists — there is nothing to register. Every `.scss` needs the empty `---`
front matter block at the top or Jekyll will not compile it.

**Scripts load in `<head>` with no `defer`.** Hence the
`document.readyState === "loading"` guard at the bottom of `first-run.js` and
`fr-pages.js`. Match it in anything new.

**JS talks to markup through `data-fr-*` attributes** — `data-fr-row` and
`data-fr-panel` for the project index, `data-fr-disclose` for the +/– rows,
`data-fr-filter` / `data-fr-option` / `data-fr-key` for the segmented filters
on People and Publications. Rename one in the HTML and the behaviour silently
stops; nothing errors.

**Everything is progressive enhancement.** Without JS the first project panel
shows, every disclosure is closed but reachable through its own page, and every
filtered list shows in full. Keep it that way; `fr-pages.js` also pauses the
autoplaying film for anyone who asks for reduced motion.

**Images:** `{{ "images/…" | relative_url }}`, `loading="lazy"`, and
`{% include fallback.html %}` for anything that might be missing.

**The prose is bilingual where it is addressed to Italians** — the school
seminars and outreach text are Italian with an English translation in italics
underneath. British spelling in the English.

**Custom Liquid filters** live in `_plugins/` — `file_exists`, `file_read`,
`is_nil`, `regex_strip`, `array_carve`, `hash_default` and friends. Check there
before assuming a filter is stock Liquid.

**Comments explain why, not what.** The existing ones carry the design
reasoning — why the mosaic sits behind the rail, why the video is muted, why a
split is capped. Match that density; don't strip them.

## Previewing a change

Docker is the route the template supports, and it brings its own Ruby:

```bash
./.docker/run.sh
```

then open `localhost:4000`. It hot-reloads, and it re-runs `_cite/cite.py` on
start — so a local preview reaches out to ORCID and PubMed and can modify
`_data/citations.yaml`. Check `git status` before committing after a preview.

Plain `bundle exec jekyll serve` does **not** work out of the box on this Mac:
the system Ruby is 2.6 and `Gemfile.lock` wants bundler 2.5.6. Installing a
modern Ruby would fix it; nobody has.

`proofer: false` in `_config.yaml` disables the built-in html-proofer link
check on build. Turn it on locally if you have touched a lot of links.

## Workflow

- **Commit straight to `main`, then push.** No feature branches, no PRs.
- Pull first — CI commits citation updates back to `main`.
