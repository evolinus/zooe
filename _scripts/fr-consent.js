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

/*
  no consent means no analytics cookies, including ones from before there was
  anything to consent to: the tag ran ungated for a few days, and _ga lasts two
  years. so anything GA left behind is cleared unless the answer was yes.
*/
const frConsentClearCookies = () => {
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

const frConsent = () => {
  const choice = frConsentRead();

  // an answer from an earlier visit
  if (choice === "granted") frConsentStart();
  else frConsentClearCookies();

  const banner = document.querySelector("[data-fr-consent]");
  if (!banner) return;

  banner.querySelectorAll("[data-fr-consent-action]").forEach((button) =>
    button.addEventListener("click", () => {
      const answer = button.getAttribute("data-fr-consent-action");
      frConsentWrite(answer);
      if (answer === "granted") frConsentStart();
      else frConsentClearCookies();
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
