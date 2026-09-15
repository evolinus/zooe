/*
  cookie consent.

  the analytics loader in _includes/analytics.html is the only thing that
  reaches Google, and it is called from here - never before a choice has been
  made, and never again once the answer was no.

  without javascript there is no banner and no analytics either, which is the
  right way round: the tag cannot load without this file running.
*/

const frConsentKey = "fr-consent";

/* private windows and browsers set to block site data throw on access, so a
   failed read is treated as "not answered yet" and a failed write is dropped */
const frConsentRead = () => {
  try {
    return window.localStorage.getItem(frConsentKey);
  } catch (error) {
    return null;
  }
};

const frConsentWrite = (value) => {
  try {
    window.localStorage.setItem(frConsentKey, value);
  } catch (error) {
    // nothing to do: the banner will simply ask again next time
  }
};

const frConsentStart = () => {
  if (window.frAnalytics) window.frAnalytics.load();
};

const frConsent = () => {
  const choice = frConsentRead();

  // an answer from an earlier visit
  if (choice === "granted") frConsentStart();

  const banner = document.querySelector("[data-fr-consent]");
  if (!banner) return;

  banner.querySelectorAll("[data-fr-consent-action]").forEach((button) =>
    button.addEventListener("click", () => {
      const answer = button.getAttribute("data-fr-consent-action");
      frConsentWrite(answer);
      if (answer === "granted") frConsentStart();
      banner.hidden = true;
    })
  );

  // withdrawing has to be as easy as giving: the footer link comes back here
  document.querySelectorAll("[data-fr-consent-reopen]").forEach((link) =>
    link.addEventListener("click", (event) => {
      event.preventDefault();
      banner.hidden = false;
    })
  );

  if (choice !== "granted" && choice !== "denied") banner.hidden = false;
};

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", frConsent);
else frConsent();
