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

  window.dispatchEvent(new Event('resize'));
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
