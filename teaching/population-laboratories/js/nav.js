// Master tab switcher, shared by every room.
//
// Rooms are plain <div class="tab-content"> blocks whose id is "tab-" + the id
// passed here. Only one is visible at a time. Canvases inside a hidden tab have
// no measurable width, so anything drawn while hidden comes out at the fallback
// size — that's why switching fires a global resize event: every room listens
// for it and redraws itself at its true width once it becomes visible.
//
// The bar is a real ARIA tablist, so it also carries the selection state and the
// roving tabindex that lets a keyboard user move along it with the arrow keys
// rather than tabbing through nine buttons to reach the last room.
function switchTab(tabId, evt) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => {
    el.classList.remove('active');
    el.setAttribute('aria-selected', 'false');
    el.setAttribute('tabindex', '-1');
  });

  document.getElementById('tab-' + tabId).classList.add('active');
  const btn = evt ? evt.currentTarget : document.getElementById('tabbtn-' + tabId);
  if (btn) {
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    btn.setAttribute('tabindex', '0');
  }

  // On a narrow window the bar is one swipeable row rather than three wrapped
  // ones, so the tab just chosen can be off the end of the strip. Bring it back
  // — 'nearest' so that on a wide window, where the whole bar is visible, this
  // is a no-op rather than a sideways jolt.
  if (btn && btn.scrollIntoView) {
    btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  // Land at the top of the room. Every caller used to do this itself — the
  // twenty-nine "Where this goes next" links each carried their own
  // window.scrollTo(0,0), and the tab buttons carried none, so clicking a tab
  // from the foot of a long room dropped the reader into the middle of the next
  // one. One place, one behaviour.
  window.scrollTo(0, 0);

  window.dispatchEvent(new Event('resize'));
  // Rooms that animate listen for this so they can stop when the reader walks
  // away rather than playing on in a hidden tab. LAB.createPlayer subscribes on
  // behalf of all eight, so a room has to do nothing.
  document.dispatchEvent(new CustomEvent('lab:tabchange', { detail: { tabId: tabId } }));
}

// The tab bar is sticky, so anything scrolled into view has to clear it.
// Measured rather than assumed: the bar wraps to two or three rows on a narrow
// window, and at 800px it is already two.
function labNavHeight() {
  const bar = document.querySelector('.tab-nav-bar');
  return bar ? Math.round(bar.getBoundingClientRect().height) : 0;
}

/* Pressing Run brings its results into view.

   Every deck sits above the panels it drives, and the taller rooms put those
   panels below the fold on a laptop — so a reader could press Run, see the
   button turn into Pause, and think nothing had happened. Each Run button names
   its own panel in data-results rather than the handler guessing from the DOM.

   It listens in the capture phase, ahead of the room's own handler. Pressing Run
   computes the whole trajectory in one synchronous pass before it returns, so a
   scroll asked for afterwards is asked for on a main thread that is already
   busy, and a smooth scroll starved at the start never moves at all. Measuring
   early is safe because every panel it targets is static markup the room fills
   in, so the box is already where it will be.

   The test for doing nothing is whether the page is already within a few pixels
   of where the scroll would put it — not whether the panel is somewhere in the
   upper part of the window. A reader who had scrolled down to read a chart and
   pressed Run again would satisfy that second test and be left where they were.
   Stepping through a run still does not yank the page, but for the honest
   reason: the destination is the position it is already in. */
document.addEventListener('click', (e) => {
  const btn = e.target.closest && e.target.closest('button[data-results]');
  if (!btn) return;
  const target = document.querySelector(btn.getAttribute('data-results'));
  if (!target) return;

  const destination = () => Math.max(0,
    window.pageYOffset + target.getBoundingClientRect().top - labNavHeight() - 10);
  const settled = () => Math.abs(window.pageYOffset - destination()) < 4;
  if (settled()) return;

  const bring = (behavior) => window.scrollTo({ top: destination(), behavior: behavior });
  const smooth = !(window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  bring(smooth ? 'smooth' : 'auto');

  // One correction once the press has finished doing whatever it does, because
  // going first has a cost: the destination is measured against the layout as it
  // stands before the room reacts. A press changes the status line from "Set the
  // parameters and press Run." to "running…", and in the rooms where that is the
  // longest thing on its row the deck loses a line and the panel below climbs
  // 22px out from under the scroll that was aimed at it. The same test decides
  // it as before — if the page is not at the destination by now, put it there.
  setTimeout(() => {
    if (!target.getBoundingClientRect().height) return;
    if (settled()) return;
    bring('auto');
  }, 500);
}, true);

/* Previous/Next at the foot of every room.

   The eight rooms are one argument in order, and the only thing that had been
   saying so was a "Where this goes next" link inside each What to notice panel
   — which points where the *idea* goes, and deliberately skips about: the
   Keystone Room sends the reader back to Neighbours and Predator, not on.

   The order is not written down a second time. There is no ROOM_ORDER array
   here, because the tab bar is the reading order and a second copy of it would
   be free to drift; this reads the bar. Each room's name comes from its own
   masthead heading rather than the tab's short label, so "Next" names The
   Crowding Room and not "Crowding". The README is skipped at the near end: it
   is the map, not the first room. */
function buildRoomNav() {
  const tabs = Array.from(document.querySelectorAll('.tab-btn'))
    .map(b => b.id.replace(/^tabbtn-/, ''))
    .filter(id => id !== 'readme');
  const nameOf = id => {
    const h = document.querySelector('#tab-' + id + ' .masthead h1');
    return h ? h.textContent.trim() : id;
  };
  tabs.forEach((id, i) => {
    const room = document.getElementById('tab-' + id);
    if (!room || room.querySelector('.room-nav')) return;
    const nav = document.createElement('nav');
    nav.className = 'room-nav';
    nav.setAttribute('aria-label', 'Room navigation');
    // A button on each side even when there is only one, so the one that does
    // exist stays on its own side of the rule rather than sliding across it.
    const link = (target, side) => {
      if (!target) return '<span></span>';
      return `<button type="button" class="room-nav-link room-nav-${side}" `
           + `onclick="switchTab('${target}')">`
           + `<span class="room-nav-dir">${side === 'prev' ? '← Previous' : 'Next →'}</span>`
           + `<span class="room-nav-name">${nameOf(target)}</span></button>`;
    };
    nav.innerHTML = link(tabs[i - 1], 'prev') + link(tabs[i + 1], 'next');
    room.appendChild(nav);
  });
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', buildRoomNav);
} else {
  buildRoomNav();
}

// Arrow keys move along the bar and switch as they go, which is what a tablist
// is expected to do; Home and End jump to the ends.
document.addEventListener('keydown', e => {
  const current = e.target.closest && e.target.closest('.tab-btn');
  if (!current) return;
  const tabs = Array.from(document.querySelectorAll('.tab-btn'));
  const i = tabs.indexOf(current);
  let next = null;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = tabs[(i + 1) % tabs.length];
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = tabs[(i - 1 + tabs.length) % tabs.length];
  else if (e.key === 'Home') next = tabs[0];
  else if (e.key === 'End') next = tabs[tabs.length - 1];
  if (!next) return;
  e.preventDefault();
  next.click();
  next.focus();
});
