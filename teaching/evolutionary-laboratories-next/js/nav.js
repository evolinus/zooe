// Room navigation: which room is showing, how you get to the next one, and
// how a room learns that the reader has walked away from it.

    // The reading order, and the single source of truth for it — the tab bar,
    // the Previous/Next links and the ?#hash all follow this array. The first
    // eight are the argument; the last three are the machinery rooms, which the
    // argument refers to but never depends on at its default settings.
    const ROOM_ORDER = [
      'readme', 'copying', 'branching', 'fate', 'drifting',
      'selection', 'mutation', 'adaptation', 'speciation',
      'reproduction', 'hardyweinberg', 'linkage'
    ];
    const ROOM_NAMES = {
      readme: 'README',
      copying: 'The Copying Room',
      branching: 'The Branching Room',
      fate: 'The Fate Room',
      drifting: 'The Drift Room',
      selection: 'The Selection Room',
      mutation: 'The Mutation Room',
      adaptation: 'The Adaptation Room',
      speciation: 'The Speciation Room',
      reproduction: 'The Reproduction Room',
      hardyweinberg: 'The Hardy–Weinberg Room',
      linkage: 'The Linkage Room'
    };

    // The tab bar is sticky, so anything a room scrolls into view has to clear
    // it. Measured rather than hard-coded: the bar wraps to two or three lines
    // on a narrow window.
    function labNavHeight() {
      const bar = document.querySelector('.tab-nav-bar');
      return bar ? Math.round(bar.getBoundingClientRect().height) : 0;
    }

    function switchTab(tabId, evt, opts) {
      if (!ROOM_NAMES[tabId]) tabId = 'readme';
      const options = opts || {};

      document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tab-btn').forEach(el => {
        el.classList.remove('active');
        el.setAttribute('aria-selected', 'false');
      });

      document.getElementById('tab-' + tabId).classList.add('active');
      const btn = document.getElementById('tabbtn-' + tabId) ||
        (evt ? evt.currentTarget : null);
      if (btn) { btn.classList.add('active'); btn.setAttribute('aria-selected', 'true'); }

      // A room is several screens tall and the tab bar now travels with the
      // reader, so a tab can be pressed from anywhere. Without this you land
      // at the same depth in a room you have not read yet.
      if (!options.keepScroll) window.scrollTo(0, 0);

      // Record the room in the URL so a room can be linked to and the browser's
      // Back button walks the rooms visited. replaceState on the first call, so
      // arriving at the page does not leave a duplicate entry behind.
      if (!options.fromHistory) {
        const hash = tabId === 'readme' ? location.pathname + location.search : '#' + tabId;
        try {
          history[options.replace ? 'replaceState' : 'pushState']({ tabId }, '', hash);
        } catch (e) { /* file:// in some browsers refuses pushState; the tabs still work */ }
      }

      // Dispatch a global resize notification to ensure hidden SVG/Canvas components recalculate safely
      window.dispatchEvent(new Event('resize'));
      // Rooms that animate on a timer listen for this so they can stop when the
      // reader navigates away instead of playing on in a hidden tab.
      document.dispatchEvent(new CustomEvent('lab:tabchange', { detail: { tabId: tabId } }));
    }

    // Previous/Next links at the foot of every room. Built here rather than
    // written into the markup ten times over, so the order lives in one place
    // and cannot drift out of step with the tab bar.
    function buildRoomNav() {
      ROOM_ORDER.forEach((tabId, i) => {
        const room = document.getElementById('tab-' + tabId);
        if (!room || room.querySelector('.room-nav')) return;
        const prev = ROOM_ORDER[i - 1], next = ROOM_ORDER[i + 1];
        const nav = document.createElement('nav');
        nav.className = 'room-nav';
        nav.setAttribute('aria-label', 'Room navigation');
        const link = (target, side) => {
          if (!target) return '<span></span>';
          const label = side === 'prev' ? '← Previous' : 'Next →';
          return `<button type="button" class="room-nav-link room-nav-${side}" onclick="switchTab('${target}')">` +
                 `<span class="room-nav-dir">${label}</span>` +
                 `<span class="room-nav-name">${ROOM_NAMES[target]}</span></button>`;
        };
        nav.innerHTML = link(prev, 'prev') + link(next, 'next');
        room.appendChild(nav);
      });
    }

    // Each room's panel belongs to the tab that opens it, so a screen reader
    // announces the pairing.
    function linkPanelsToTabs() {
      ROOM_ORDER.forEach(tabId => {
        const room = document.getElementById('tab-' + tabId);
        if (!room) return;
        room.setAttribute('role', 'tabpanel');
        room.setAttribute('aria-labelledby', 'tabbtn-' + tabId);
      });
    }

    /* Arrow keys along the tab bar. role="tab" tells a screen reader this is a
       tab list, and a reader who is told that reaches for the arrow keys — so
       the roles were promising a behaviour the page did not have.

       Focus moves; the room does not change with it. That is the manual
       activation half of the pattern, and it is the right half here because
       switchTab pushes a history entry: arrowing from one end of the bar to the
       other under automatic activation would stack eleven of them and leave the
       Back button walking rooms the reader only passed through. Enter and Space
       activate, which they already do as native buttons.

       No roving tabindex either, so every tab stays in the Tab order and a
       reader who navigates that way loses nothing. It is a deliberate departure
       from the APG, which would make only the selected tab tabbable.

       Home and End are included because with twelve rooms the bar is long
       enough for them to be worth having. */
    document.addEventListener('keydown', (e) => {
      const tab = e.target.closest && e.target.closest('.tab-btn');
      if (!tab) return;
      const bar = tab.closest('[role="tablist"]');
      if (!bar) return;
      const tabs = [...bar.querySelectorAll('.tab-btn')];
      const i = tabs.indexOf(tab);
      if (i < 0) return;

      let next = null;
      if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
      else if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (e.key === 'Home') next = tabs[0];
      else if (e.key === 'End') next = tabs[tabs.length - 1];
      if (!next) return;

      // Arrows would otherwise scroll the page out from under the bar.
      e.preventDefault();
      next.focus();
    });

    // The segmented controls are ordinary buttons with an .active class, which
    // says nothing to a screen reader. Mirroring that class onto aria-pressed
    // centrally means no room has to remember to do it in its own handler.
    function syncSegmented(root) {
      (root || document).querySelectorAll('.segmented').forEach(group => {
        group.querySelectorAll('button').forEach(b => {
          b.setAttribute('aria-pressed', b.classList.contains('active') ? 'true' : 'false');
        });
      });
    }
    // Bubbles to the document after the room's own delegated handler has moved
    // the .active class, so it always reads the settled state.
    document.addEventListener('click', (e) => {
      const group = e.target.closest && e.target.closest('.segmented');
      if (group) syncSegmented(group.parentElement);
    });

    function roomFromHash() {
      const id = (location.hash || '').replace(/^#/, '');
      return ROOM_NAMES[id] ? id : 'readme';
    }

    document.addEventListener('DOMContentLoaded', () => {
      linkPanelsToTabs();
      buildRoomNav();
      syncSegmented();
      const start = roomFromHash();
      // keepScroll so a reload of #fate does not fight the browser's own
      // attempt to restore where the reader was.
      switchTab(start, null, { replace: true, keepScroll: start === 'readme' });
    });

    // Back and Forward walk the rooms.
    window.addEventListener('popstate', () => {
      switchTab(roomFromHash(), null, { fromHistory: true });
    });

    /* Pressing Run scrolls its results into view.
       Every deck sits above the panels it drives, and on a laptop window the
       taller rooms put those panels below the fold — so a reader could press Run,
       see the button go grey, and think nothing had happened. Each run button
       names its own panel in data-results rather than the handler guessing from
       the DOM, because what counts as "the result" differs per room: the Fate
       Room has two decks with a panel each, the Hardy-Weinberg Room has a panel
       between its deck and its stage that is not a result at all, and the
       Speciation Room aims at the populations rather than at the verdict that
       judges them — the verdict sits below them and is announced through
       aria-live anyway, so aiming at it would scroll the three populations off
       the top and leave the reader the answer without the evidence.

       Two rooms are deliberately not wired to it, because they already solve
       this and solve it better. The Fate Room's revealRun() frames the tally,
       the two populations and the chart together and holds the first generation
       back until the scroll has settled; the Branching Room's keepGenInView()
       follows the growing tree rather than jumping once. A second scroller in
       either would fight the one that is there.

       It listens in the capture phase, and that is load-bearing rather than
       incidental. Run in the ordinary bubble phase, the scroll is asked for
       after the room's handler has already started its timer or its animation
       loop, and in the three busiest rooms — Copying, Drift and Linkage — the
       work on the main thread starves the smooth scroll and the page never
       moves at all. Going first means the animation is under way before the
       simulation starts competing with it. Measuring that early is safe because
       every panel it targets is static markup that the room fills in, so the
       box is already where it will be.

       Pressing Run always brings the panel back, even when it is partly on
       screen already. The test for doing nothing is whether the page is within a
       few pixels of where the scroll would put it, not whether the panel is
       somewhere in the upper part of the window: a reader who had scrolled down
       to read the chart and then pressed Run again was left where they were,
       because the panel still counted as visible. Stepping a generation at a
       time still does not yank the page, but now for the honest reason — the
       destination is the position it is already in, so the scroll moves nothing.

       It clears the sticky tab bar through labNavHeight(), which measures rather
       than assumes — the bar wraps to two or three rows on a narrow window. */
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-results]');
      if (!btn) return;
      const target = document.querySelector(btn.getAttribute('data-results'));
      if (!target) return;

      // Where the panel should sit: just clear of the sticky bar.
      const destination = () => Math.max(0,
        window.pageYOffset + target.getBoundingClientRect().top - labNavHeight() - 10);
      // Already there, to within a pixel or two of rounding.
      const settled = () => Math.abs(window.pageYOffset - destination()) < 4;
      const bring = (behavior) => window.scrollTo({ top: destination(), behavior: behavior });

      if (settled()) return;
      const smooth = !(window.matchMedia
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      bring(smooth ? 'smooth' : 'auto');

      // One correction pass once the press has finished doing whatever it does,
      // because going first has two costs. A room that hides a panel on the
      // press — "Run 10 Simulations" swaps the single run out for the chart —
      // shortens the page under a scroll that was aimed at the old layout, and
      // overshoots. A room that does all its work in one go without yielding —
      // "Run all replicates" plays out two hundred populations — never leaves
      // the main thread free for the animation, and does not move at all. The
      // same test decides both: if the page is not at the destination by now,
      // put it there. A panel with no height was hidden by the press and is not
      // ours to chase.
      setTimeout(() => {
        if (!target.getBoundingClientRect().height) return;
        if (settled()) return;
        bring('auto');
      }, 500);
    }, true);
