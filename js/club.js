/* The Sanctuary Club — live page. Standalone file (not main.js).
   LIVE: waitlist runs by email until the backend lands; the preview switcher is removed and the date decides.
   FLAG — OPENING DATE NOT SET (Tony, Oct 30, 2026): OPENING_DATE below is null
   on purpose. Do NOT put a placeholder date here — a guessed date would
   auto-open enrollment whether the cafe is ready or not. Set it (YYYY-MM-DD)
   only when the opening date is announced — trigger: funding secured.
   Until then the page defaults to Upcoming. The preview switcher is removed
   on this page; the date decides. */

(function () {
  "use strict";

  /* Enrollment states. Dates are relative to opening by design: founding
     enrollment = 2 weeks pre-launch + 2 weeks post-launch, then closed.
     No calendar date is promised until the opening date is set. */
  var STATES = {
    upcoming: {
      title: "Founding enrollment isn't open yet.",
      body: "It opens two weeks before our doors open and runs for four weeks — then it closes. " +
        "Join the waitlist and we'll tell you the day it opens, and the day it closes, because four weeks goes fast.",
      cta: "Join the waitlist",
      joinHeading: "Join the waitlist.",
      joinBody: "Founding enrollment isn't open yet. Email hello@connectionsep.com with 'Club waitlist' in the subject and we'll tell you the day it opens — " +
        "and the day it closes, because four weeks goes fast.",
      closed: false
    },
    open: {
      title: "Founding enrollment is OPEN.",
      body: "Four weeks, then it closes: two weeks before our doors open, two weeks after. " +
        "After that, enrollment stays closed until the next cohort. If you want in on the founding " +
        "cohort, this is the window.",
      cta: "Become a founding member",
      joinHeading: "Become a founding member.",
      joinBody: "Enrollment is open now and closes two weeks after our doors open. " +
        "Pick your tier above, then complete enrollment before the window closes.",
      closed: false
    },
    closed: {
      title: "Founding enrollment is closed.",
      body: "The founding cohort is set — and the door isn't gone, it's just on a schedule. " +
        "A second cohort opens later, when the roastery opens. Join the waitlist for it and " +
        "you'll hear the day it opens.",
      cta: "Join the waitlist for the next cohort",
      joinHeading: "Join the waitlist for the next cohort.",
      joinBody: "Founding enrollment has closed. Email hello@connectionsep.com with 'Club waitlist' in the subject and we'll tell you when the next " +
        "cohort opens, at the roastery.",
      closed: true
    }
  };

  var banner = document.getElementById("status-banner");
  var titleEl = document.getElementById("status-title");
  var bodyEl = document.getElementById("status-body");
  var ctaEl = document.getElementById("status-cta");
  var joinHeading = document.getElementById("join-h");
  var joinBody = document.getElementById("join-body");

  /* Auto enrollment state, from ONE date. No date = Upcoming (safe default).
     Enrollment window: 14 days before opening through 14 days after
     (28 days total). Calendar dates are compared, not timestamps, so
     timezones and daylight saving cannot shift a boundary day. */
  var OPENING_DATE = null; // e.g. "2027-01-15" — set only when announced (see FLAG above).
  function parseLocalDate(s) {
    var p = s.split("-");
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function addDays(d, n) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  }
  function autoState() {
    if (!OPENING_DATE) { return "upcoming"; }
    var opening = parseLocalDate(OPENING_DATE);
    var opens = addDays(opening, -14);
    var closes = addDays(opening, 14);
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (today < opens) { return "upcoming"; }
    if (today < closes) { return "open"; }
    return "closed";
  }

  function setState(state) {
    var s = STATES[state];
    titleEl.textContent = s.title;
    bodyEl.textContent = s.body;
    ctaEl.textContent = s.cta;
    joinHeading.textContent = s.joinHeading;
    joinBody.textContent = s.joinBody;
    if (s.closed) { banner.classList.add("closed"); }
    else { banner.classList.remove("closed"); }
    document.querySelectorAll(".state-btn").forEach(function (btn) {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-state") === state ? "true" : "false");
    });
  }

  document.querySelectorAll(".state-btn").forEach(function (btn) {
    btn.addEventListener("click", function () { setState(btn.getAttribute("data-state")); });
  });

  

  setState(autoState()); // initial view follows the date; switcher still overrides by hand.
})();
