/*
  interior page interactions: +/– disclosures (research rows, member cards) and
  segmented filters (alumni categories, publication types).
  progressive enhancement — without JS every disclosure is closed but readable
  through its own page, and every filtered set shows in full.
*/

// scripts.html loads this in <head> with no defer, so wait for the DOM
const frPages = () => {
  // +/– disclosures
  document.querySelectorAll("[data-fr-disclose]").forEach((button) => {
    const target = document.getElementById(
      button.getAttribute("data-fr-disclose")
    );
    if (!target) return;

    button.addEventListener("click", () => {
      const open = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!open));
      button.textContent = open ? "+" : "–";
      target.hidden = open;
    });
  });

  // segmented filters
  document.querySelectorAll("[data-fr-filter]").forEach((group) => {
    const listId = group.getAttribute("data-fr-filter");
    const list = document.getElementById(listId);
    if (!list) return;

    const items = [...list.querySelectorAll("[data-fr-key]")];

    const apply = (key) => {
      items.forEach((item) => {
        const match = key === "all" || item.getAttribute("data-fr-key") === key;
        item.hidden = !match;
      });
    };

    group.addEventListener("click", (event) => {
      const option = event.target.closest("[data-fr-option]");
      if (!option) return;
      group.querySelectorAll("[data-fr-option]").forEach((el) => {
        el.setAttribute("aria-selected", String(el === option));
      });
      apply(option.getAttribute("data-fr-option"));
    });

    const selected = group.querySelector('[data-fr-option][aria-selected="true"]');
    apply(selected ? selected.getAttribute("data-fr-option") : "all");
  });
};

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", frPages);
else frPages();
