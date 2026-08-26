/*
  homepage first-run interactions: the project index and the three-set index.
  progressive enhancement — without JS the first project panel and the People
  set are simply the ones on show.
*/

// scripts.html loads this in <head> with no defer, so wait for the DOM
const frFirstRun = () => {
  const select = (container, attr, value) => {
    container.querySelectorAll("[" + attr + "]").forEach((el) => {
      el.setAttribute("aria-selected", String(el.getAttribute(attr) === value));
    });
  };

  // project index
  const index = document.querySelector("[data-fr-index]");
  if (index) {
    index.addEventListener("click", (event) => {
      const row = event.target.closest("[data-fr-row]");
      if (!row) return;
      const key = row.getAttribute("data-fr-row");
      select(index, "data-fr-row", key);
      index.querySelectorAll("[data-fr-panel]").forEach((panel) => {
        panel.hidden = panel.getAttribute("data-fr-panel") !== key;
      });
    });
  }

  // three-set index
  const switcher = document.querySelector("[data-fr-switch]");
  if (switcher) {
    const count = switcher.querySelector("[data-fr-count]");

    const showCount = (key) => {
      if (!count) return;
      const set = switcher.querySelector('[data-fr-set="' + key + '"]');
      const rows = set ? set.querySelectorAll(".fr-index-row").length : 0;
      count.textContent = rows + " entries";
    };

    switcher.addEventListener("click", (event) => {
      const tab = event.target.closest("[data-fr-tab]");
      if (!tab) return;
      const key = tab.getAttribute("data-fr-tab");
      select(switcher, "data-fr-tab", key);
      switcher.querySelectorAll("[data-fr-set]").forEach((set) => {
        set.hidden = set.getAttribute("data-fr-set") !== key;
      });
      showCount(key);
    });

    showCount("people");
  }
};

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", frFirstRun);
else frFirstRun();
