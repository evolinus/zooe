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
