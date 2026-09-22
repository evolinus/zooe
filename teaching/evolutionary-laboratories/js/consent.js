/*
  Cookie consent for a room opened on its own.

  Most readers arrive here from a search result or an emailed link, having
  never seen the lab site — so the banner the site carries is no use to them,
  and without one of our own their visit is invisible. That is the whole reason
  this file exists.

  It mirrors _scripts/fr-consent.js on the site, and deliberately shares its
  storage: the same key, and both apps sit on the same origin as the site, so
  an answer given in a room is honoured on the site and an answer given on the
  site is honoured here. Nobody is asked twice, and withdrawing in either place
  withdraws in both. The two files have to move together.

  Duplicating them is the price of the folder being standalone: nothing Jekyll
  writes reaches these files, and a shared script would have to be fetched from
  the site, which is exactly what a copy on a VLE or a stick cannot do.

  Without JavaScript there is no banner and no analytics either, which is the
  right way round: the tag cannot load without this file running.
*/

const labConsentKey = "fr-consent";

/* private windows and browsers set to block site data throw on access, so a
   failed read is treated as "not answered yet" and a failed write is dropped */
const labConsentRead = () => {
  try {
    return window.localStorage.getItem(labConsentKey);
  } catch (error) {
    return null;
  }
};

const labConsentWrite = (value) => {
  try {
    window.localStorage.setItem(labConsentKey, value);
  } catch (error) {
    // nothing to do: the banner will simply ask again next time
  }
};

/*
  no consent means no analytics cookies, including ones left by the site before
  the answer was changed to no - _ga lasts two years, and the answer given in a
  room governs the whole origin.
*/
const labConsentClearCookies = () => {
  const names = document.cookie
    .split("; ")
    .map((pair) => pair.split("=")[0])
    .filter((name) => /^(_ga|_gid|_gat|_gac_)/.test(name));

  if (!names.length) return;

  /* a cookie only goes away if the domain and path match the ones it was set
     with, and gtag's "auto" domain is not readable from here - so every
     candidate is expired and the misses are harmless */
  const host = window.location.hostname;
  const parts = host.split(".");
  const domains = [null, host, "." + host];
  for (let i = 1; i < parts.length - 1; i++) {
    const parent = parts.slice(i).join(".");
    domains.push(parent, "." + parent);
  }

  names.forEach((name) =>
    domains.forEach((domain) => {
      document.cookie =
        name +
        "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/" +
        (domain ? "; domain=" + domain : "");
    })
  );
};

const labConsent = () => {
  const choice = labConsentRead();

  // an answer from an earlier visit, to a room or to the site. the tag may
  // already have been loaded by the head script; load() is guarded
  if (choice === "granted") {
    if (window.labAnalytics) window.labAnalytics.load();
  } else {
    labConsentClearCookies();
  }

  /*
    a copy running off a stick or a VLE has nobody to report to, so there is
    nothing to ask about: no banner, and no mention of cookies in the README
    either. both stay hidden unless the tag could actually run.
  */
  if (!window.labAnalytics || !window.labAnalytics.reportable()) return;

  document
    .querySelectorAll("[data-consent-note]")
    .forEach((note) => (note.hidden = false));

  const banner = document.querySelector("[data-consent]");
  if (!banner) return;

  banner.querySelectorAll("[data-consent-action]").forEach((button) =>
    button.addEventListener("click", () => {
      const answer = button.getAttribute("data-consent-action");
      labConsentWrite(answer);
      if (answer === "granted") window.labAnalytics.load();
      else labConsentClearCookies();
      banner.hidden = true;
    })
  );

  // withdrawing has to be as easy as giving: the README link comes back here
  document.querySelectorAll("[data-consent-reopen]").forEach((link) =>
    link.addEventListener("click", () => {
      banner.hidden = false;
    })
  );

  // shown rather than dismissed, so a reader who has already answered never
  // sees it flash past on the way in
  if (choice !== "granted" && choice !== "denied") banner.hidden = false;
};

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", labConsent);
else labConsent();
