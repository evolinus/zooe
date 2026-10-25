#!/usr/bin/env python3
"""Build the printable room guides for the two laboratory apps.

    python3 _guides/build.py            # every guide, both apps
    python3 _guides/build.py drift      # only sources whose name contains "drift"
    python3 _guides/build.py --html     # stop at the HTML (in the temp folder), for checking layout

Each room has one plain-text source in _guides/<app>/, and comes out as
teaching/<app>/guides/<same name>.pdf, which is the address the room links.
The sources live out here rather than beside the PDFs because Jekyll skips
anything under an underscore, so nothing but the finished PDFs is published;
the apps themselves stay plain static folders that work copied onto a stick.

The PDF is printed by headless Chrome from an HTML page this script writes.
Chrome rather than a Python PDF library because it already sets type the way
the rooms do - Georgia and the system monospace, real sub- and superscripts,
the same unicode the room text uses - and because the one machine this has to
run on always has it. Nothing here needs a package beyond the standard library.

The source format is described in _guides/README.md.
"""

import html
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CHROME_CANDIDATES = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "google-chrome",
    "chromium",
]

APPS = {
    "evolutionary-laboratories": {
        "name": "Evolutionary Laboratories",
        "url": "https://evolinus.github.io/zooe/teaching/evolutionary-laboratories/",
        # opens straight into a room from #id; the other app always starts at
        # its README, so its guides name the tab instead
        "hash": True,
    },
    "population-laboratories": {
        "name": "Population Laboratories",
        "url": "https://evolinus.github.io/zooe/teaching/population-laboratories/",
        "hash": False,
    },
}


# ---------------------------------------------------------------- inline text

def inline(text):
    """The handful of shorthands the sources use, on top of plain HTML.

    **bold**, *italic*, and $N$ for a variable, which is set in italic serif the
    way the rooms set <var>. Raw HTML passes through untouched, so a subscript
    is just <sub>. The text is not escaped: the sources are ours and are
    written as HTML fragments."""
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<em>\1</em>", text)
    text = re.sub(r"\$(.+?)\$", lambda m: "<var>" + scripts(m.group(1)) + "</var>", text)
    # typographic quotes, since the sources are typed with straight ones; the
    # sources carry no attributes, so there is no quoted markup to protect
    text = re.sub(r'"([^"<>]+)"', "\u201c\\1\u201d", text)
    text = re.sub(r"(\w)'(\w)", "\\1\u2019\\2", text)
    return text


def scripts(v):
    """Inside $...$ only: H_t and H_{t+1} for subscripts, x^2 and e^{-t/M} for
    superscripts, set upright so the italic stays on the letter."""
    v = re.sub(r"_\{(.+?)\}|_(\w+)", lambda m: "<sub>" + (m.group(1) or m.group(2)) + "</sub>", v)
    v = re.sub(r"\^\{(.+?)\}|\^(\w+)", lambda m: "<sup>" + (m.group(1) or m.group(2)) + "</sup>", v)
    return v


# ---------------------------------------------------------------- parsing

def parse(path):
    """Header lines (key: value) until the first '#', then '#' sections.

    A section heading is '# kind [arguments]'. Inside a section, lines starting
    with '- ' are list items; 'key: value' lines are fields (steps use them);
    anything else is a paragraph. A line indented by two spaces or more
    continues the previous item, field or paragraph."""
    meta, sections = {}, []
    current = None
    last = None  # the dict/list slot a continuation line appends to
    with open(path, encoding="utf-8") as f:
        lines = f.read().split("\n")
    for raw in lines:
        if not raw.strip():
            last = None
            continue
        if raw.lstrip().startswith("//"):
            continue
        if raw.startswith("# "):
            head = raw[2:].strip()
            kind, _, rest = head.partition(" ")
            current = {"kind": kind, "arg": rest.strip(), "items": [], "fields": {}, "paras": []}
            sections.append(current)
            last = None
            continue
        if current is None:
            key, _, val = raw.partition(":")
            meta[key.strip()] = val.strip()
            continue
        if raw.startswith("  ") and last is not None:
            container, key = last
            container[key] = container[key] + " " + raw.strip()
            continue
        line = raw.strip()
        if line.startswith("- "):
            current["items"].append(line[2:])
            last = (current["items"], len(current["items"]) - 1)
            continue
        m = re.match(r"^([a-z]+):\s?(.*)$", line)
        if m and current["kind"] == "step":
            current["fields"][m.group(1)] = m.group(2)
            last = (current["fields"], m.group(1))
            continue
        current["paras"].append(line)
        last = (current["paras"], len(current["paras"]) - 1)
    return meta, sections


# ---------------------------------------------------------------- rendering

def answer_lines(n):
    return '<div class="lines">' + '<span></span>' * n + "</div>"


def tag_label(path):
    return {"core": "Core · BSc", "ext": "Extension · MSc"}[path]


def render_step(n, sec):
    # '# step core 10 | Title'
    m = re.match(r"^(core|ext)\s+(\d+)\s*\|\s*(.+)$", sec["arg"])
    if not m:
        raise SystemExit(f"bad step heading: {sec['arg']!r}")
    path, minutes, title = m.group(1), int(m.group(2)), m.group(3)
    f = sec["fields"]
    out = [f'<section class="step step-{path}">']
    out.append(
        f'<header><span class="step-num">{n}</span>'
        f'<h3>{inline(title)}</h3>'
        f'<span class="step-time">{minutes} min</span></header>'
    )
    if "set" in f:
        out.append(f'<p class="set"><span class="lbl">Set up</span>{inline(f["set"])}</p>')
    if "predict" in f:
        out.append(
            f'<div class="ask predict"><p><span class="lbl">Predict first</span>{inline(f["predict"])}</p>'
            f'{answer_lines(int(f.get("plines", 2)))}</div>'
        )
    if "run" in f:
        out.append(f'<p class="run"><span class="lbl">Run</span>{inline(f["run"])}</p>')
    if "look" in f:
        out.append(f'<p class="look"><span class="lbl">Look at</span>{inline(f["look"])}</p>')
    if "explain" in f:
        out.append(
            f'<div class="ask explain"><p><span class="lbl">Explain</span>{inline(f["explain"])}</p>'
            f'{answer_lines(int(f.get("elines", 3)))}</div>'
        )
    if "note" in f:
        out.append(f'<p class="note">{inline(f["note"])}</p>')
    out.append("</section>")
    return path, minutes, "\n".join(out)


def render_guide(app, meta, sections):
    info = APPS[app]
    colour = meta.get("colour", "#262220")
    url = html.escape(info["url"] + ("#" + meta["id"] if info["hash"] else ""))
    if not info["hash"]:
        tab = re.sub(r"^The | Room$", "", re.sub("<[^>]+>", "", meta["title"]))
        url += f' <span class="sub">— then the {html.escape(tab)} tab</span>'

    steps, objectives, routes, questions, checks, intro = [], {}, [], [], [], []
    n = 0
    for sec in sections:
        k = sec["kind"]
        if k == "step":
            n += 1
            steps.append(render_step(n, sec))
        elif k == "objectives":
            objectives[sec["arg"] or "core"] = sec["items"]
        elif k == "routes":
            routes = sec["items"]
        elif k == "questions":
            questions = sec["items"]
        elif k == "check":
            checks = sec["items"]
        elif k == "intro":
            intro = sec["paras"]
        else:
            raise SystemExit(f"unknown section '# {k}'")

    core_min = sum(m for p, m, _ in steps if p == "core")
    ext_min = sum(m for p, m, _ in steps if p == "ext")
    core_n = sum(1 for p, _, _ in steps if p == "core")
    ext_from, ext_to = core_n + 1, len(steps)

    body = []
    body.append(f'''
<header class="mast">
  <div class="mast-top"><span>{info["name"]}</span><span>Room guide</span></div>
  <h1><span class="num">{meta.get("num", "")}</span>{inline(meta["title"])}</h1>
  <p class="kicker">{inline(meta.get("kicker", ""))}</p>
</header>
<div class="glance">
  <div><span class="lbl">Core path · BSc</span><strong>about {core_min} min</strong><span class="sub">steps 1–{core_n}</span></div>
  <div><span class="lbl">Extension · MSc</span><strong>+ {ext_min} min</strong><span class="sub">steps {ext_from}–{ext_to}</span></div>
  <div class="wide"><span class="lbl">Before this room</span><span class="sub">{inline(meta.get("before", "Nothing: it stands on its own."))}</span></div>
  <div class="wide"><span class="lbl">Open the room</span><span class="url">{url}</span></div>
</div>''')
    for p in intro:
        body.append(f'<p class="intro">{inline(p)}</p>')

    body.append('<div class="two">')
    body.append('<section class="obj"><h2>Learning objectives</h2>')
    body.append('<p class="obj-head">After the core path you should be able to</p><ul>')
    body += [f"<li>{inline(i)}</li>" for i in objectives.get("core", [])]
    body.append("</ul>")
    if objectives.get("ext"):
        body.append('<p class="obj-head">The extension adds</p><ul>')
        body += [f"<li>{inline(i)}</li>" for i in objectives["ext"]]
        body.append("</ul>")
    body.append("</section>")
    body.append('<section class="routes"><h2>Suggested routes</h2><ul>')
    body += [f"<li>{inline(i)}</li>" for i in routes]
    body.append("</ul></section></div>")

    body.append(
        '<p class="how"><strong>How to work through it.</strong> Every step asks you to '
        '<em>predict</em> before you press anything, and to <em>explain</em> afterwards. '
        'Write the prediction down and commit to it: a wrong prediction you can account for '
        'teaches more than a right one you guessed. Runs are random, so where a step says so, '
        'run it more than once before you decide what happened.</p>'
    )

    body.append('<h2 class="band">Core path · BSc</h2>')
    started_ext = False
    for path, _, h in steps:
        if path == "ext" and not started_ext:
            started_ext = True
            body.append('<h2 class="band ext">Extension · MSc</h2>')
        body.append(h)

    if questions:
        body.append('<section class="questions"><h2>Discussion and worksheet questions</h2><ol>')
        for q in questions:
            m = re.match(r"^\[(core|ext)\]\s*(.*)$", q)
            tag, text = (m.group(1), m.group(2)) if m else ("core", q)
            body.append(f'<li><span class="qtag q-{tag}">{"BSc" if tag == "core" else "MSc"}</span>{inline(text)}</li>')
        body.append("</ol></section>")

    if checks:
        body.append('<section class="check"><h2>Checking your reasoning</h2>'
                    '<p class="check-sub">Read this after you have written your own answers. '
                    'These are what the model should show on most runs — not the only acceptable '
                    'explanations.</p><ul>')
        body += [f"<li>{inline(c)}</li>" for c in checks]
        body.append("</ul></section>")

    footer_left = f'{info["name"]} · {re.sub("<[^>]+>", "", inline(meta["title"]))}'
    return page(meta["title"], colour, footer_left, "\n".join(body))


def render_overview(app, meta, sections, rooms):
    """The one-page-or-two map of a whole app: every room's times and focus,
    and the routes through the set. Room rows are read from the room sources
    themselves, so the times here cannot drift from the guides'."""
    info = APPS[app]
    body = [f'''
<header class="mast">
  <div class="mast-top"><span>{info["name"]}</span><span>Guide for students and instructors</span></div>
  <h1>{inline(meta["title"])}</h1>
  <p class="kicker">{inline(meta.get("kicker", ""))}</p>
</header>''']
    for sec in sections:
        if sec["kind"] == "intro":
            body += [f'<p class="intro">{inline(p)}</p>' for p in sec["paras"]]
    body.append('<table class="map"><thead><tr><th>Room</th><th>What it is for</th>'
                '<th class="t">Core<br>BSc</th><th class="t">Ext.<br>MSc</th></tr></thead><tbody>')
    total_c = total_e = 0
    for r in rooms:
        if r.get("part"):
            body.append(f'<tr class="part"><td colspan="4">{inline(r["part"])}</td></tr>')
        total_c += r["core"]
        total_e += r["ext"]
        body.append(
            f'<tr><td class="room" style="--room:{r["colour"]}"><span class="num">{r["num"]}</span>'
            f'{inline(r["title"])}<span class="file">{r["file"]}</span></td>'
            f'<td>{inline(r["focus"])}</td><td class="t">{r["core"]}</td><td class="t">+{r["ext"]}</td></tr>'
        )
    body.append(f'<tr class="total"><td colspan="2">All rooms, minutes</td>'
                f'<td class="t">{total_c}</td><td class="t">+{total_e}</td></tr></tbody></table>')
    for sec in sections:
        if sec["kind"] == "routes":
            body.append(f'<section class="routes wide"><h2>{inline(sec["arg"] or "Suggested routes")}</h2><ul>')
            body += [f"<li>{inline(i)}</li>" for i in sec["items"]]
            body.append("</ul></section>")
        elif sec["kind"] == "section":
            body.append(f'<section class="prose"><h2>{inline(sec["arg"])}</h2>')
            body += [f"<p>{inline(p)}</p>" for p in sec["paras"]]
            if sec["items"]:
                body.append("<ul>" + "".join(f"<li>{inline(i)}</li>" for i in sec["items"]) + "</ul>")
            body.append("</section>")
    return page(meta["title"], "#262220", f'{info["name"]} · {meta["title"]}', "\n".join(body))


def page(title, colour, footer_left, body):
    with open(os.path.join(HERE, "guide.css"), encoding="utf-8") as f:
        css = f.read()
    footer = footer_left.replace('"', "'")
    return f'''<!DOCTYPE html>
<html lang="en-GB"><head><meta charset="utf-8">
<title>{re.sub("<[^>]+>", "", title)}</title>
<style>
:root{{ --room: {colour}; }}
@page{{ @bottom-left{{ content: "{footer}"; }} }}
{css}
</style></head>
<body>{body}</body></html>'''


# ---------------------------------------------------------------- driver

def chrome():
    for c in CHROME_CANDIDATES:
        if os.path.isabs(c) and os.path.exists(c):
            return c
        if not os.path.isabs(c):
            from shutil import which
            if which(c):
                return which(c)
    raise SystemExit("No Chrome or Chromium found to print the PDFs with.")


def print_pdf(html_text, out_pdf, html_only):
    if html_only:
        # never beside the PDFs: that folder is published as it stands
        app = os.path.basename(os.path.dirname(os.path.dirname(out_pdf)))
        out_html = os.path.join(tempfile.gettempdir(), "zooe-guides", app, os.path.basename(out_pdf)[:-4] + ".html")
        os.makedirs(os.path.dirname(out_html), exist_ok=True)
        with open(out_html, "w", encoding="utf-8") as f:
            f.write(html_text)
        return out_html
    os.makedirs(os.path.dirname(out_pdf), exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, "guide.html")
        with open(src, "w", encoding="utf-8") as f:
            f.write(html_text)
        subprocess.run(
            [chrome(), "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
             "--no-first-run", "--no-default-browser-check",
             f"--user-data-dir={os.path.join(tmp, 'profile')}",
             f"--print-to-pdf={out_pdf}", "file://" + src],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
    return out_pdf


def sync_room_links(app, rooms):
    """Write each guide's times into the link in its room's Start here panel.

    The room shows "core path 35 min · MSc extension +34 min" beside the link,
    and those numbers belong to the guide, not to the page, so they are copied
    from here on every build rather than typed twice. The span is found by its
    data-guide attribute; a guide with no span in the app is reported, since
    that is a room nobody can reach the guide from."""
    path = os.path.join(ROOT, "teaching", app, "index.html")
    with open(path, encoding="utf-8") as f:
        page_html = f.read()
    before = page_html
    for r in rooms:
        name = r["file"][len("guides/"):-len(".pdf")]
        text = f'core path {r["core"]} min · MSc extension +{r["ext"]} min'
        pattern = rf'(<span class="room-guide-time" data-guide="{re.escape(name)}">)[^<]*(</span>)'
        page_html, n = re.subn(pattern, lambda m: m.group(1) + text + m.group(2), page_html)
        if n == 0:
            print(f"warning: no link to {r['file']} in teaching/{app}/index.html", file=sys.stderr)
    if page_html != before:
        with open(path, "w", encoding="utf-8") as f:
            f.write(page_html)
        print(f"updated guide times in teaching/{app}/index.html")


def main(argv):
    html_only = "--html" in argv
    filters = [a for a in argv if not a.startswith("--")]
    built = []
    for app in APPS:
        src_dir = os.path.join(HERE, app)
        out_dir = os.path.join(ROOT, "teaching", app, "guides")
        names = sorted(n for n in os.listdir(src_dir) if n.endswith(".txt"))
        rooms = []
        for name in names:
            if name.startswith("00-"):
                continue
            meta, sections = parse(os.path.join(src_dir, name))
            steps = [s for s in sections if s["kind"] == "step"]
            mins = lambda p: sum(int(re.match(r"^\w+\s+(\d+)", s["arg"]).group(1))
                                 for s in steps if s["arg"].startswith(p))
            rooms.append({
                "num": meta.get("num", ""), "title": meta["title"], "colour": meta.get("colour", "#262220"),
                "focus": meta.get("focus", meta.get("kicker", "")), "part": meta.get("part", ""),
                "core": mins("core"), "ext": mins("ext"), "file": "guides/" + name[:-4] + ".pdf",
            })
            if filters and not any(f in name for f in filters):
                continue
            out = print_pdf(render_guide(app, meta, sections), os.path.join(out_dir, name[:-4] + ".pdf"), html_only)
            built.append(out)
        # parts are printed once, on the first room of each
        seen = None
        for r in rooms:
            if r["part"] == seen:
                r["part"] = ""
            else:
                seen = r["part"]
        sync_room_links(app, rooms)
        overview = os.path.join(src_dir, "00-overview.txt")
        if os.path.exists(overview) and (not filters or any(f in "00-overview" for f in filters)):
            meta, sections = parse(overview)
            out = print_pdf(render_overview(app, meta, sections, rooms),
                            os.path.join(out_dir, "00-overview.pdf"), html_only)
            built.append(out)
    for b in built:
        print(os.path.relpath(b, ROOT) if b.startswith(ROOT) else b)


if __name__ == "__main__":
    main(sys.argv[1:])
