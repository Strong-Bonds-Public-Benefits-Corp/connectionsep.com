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
        "Pick your tier below, then complete enrollment before the window closes.",
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
    /* The join form only exists while enrollment is open. In
       every other state the waitlist copy above is the whole
       join section. */
    showJoinRoot(state === "open");
    if (state === "open") { initJoin(); }
  }

  document.querySelectorAll(".state-btn").forEach(function (btn) {
    btn.addEventListener("click", function () { setState(btn.getAttribute("data-state")); });
  });

  /* setState(autoState()) runs at the end of the file, after
     the join-flow elements below are assigned — calling it
     here would run the open-state join flow before its
     elements exist. */

  /* ============================================================
     Join flow (v01): tier picker + login + Square card form,
     POST /api/club-members. Runs ONLY while enrollment is open
     (see setState above) — before the opening date is set,
     none of this renders and the waitlist is the whole story.
     ------------------------------------------------------------
     Prices are shown from the page copy (the published tiers);
     the charge itself comes from the server — the frontend
     never sends a price. Tiers are the backend's exact names:
     Grounding, Connection, Sanctuary, Ally Grounding,
     Ally Connection, Ally Sanctuary, Student.
     Gift-a-tier is NOT in v01 (no recipient model yet) and
     the Student $25 x 3 split needs Square Subscriptions
     (v02) — in v01 the Student tier is charged $75 once, and
     the form says so plainly when Student is picked.
     ============================================================ */

  /* Display prices, from the tier cards above. Display only. */
  var TIERS = [
    { key: "Grounding", label: "Grounding", price: 50, note: "1 person" },
    { key: "Connection", label: "Connection", price: 75, note: "1 person" },
    { key: "Sanctuary", label: "Sanctuary", price: 100, note: "1 person" },
    { key: "Ally Grounding", label: "Ally Grounding", price: 85, note: "2 people" },
    { key: "Ally Connection", label: "Ally Connection", price: 127.50, note: "2 people" },
    { key: "Ally Sanctuary", label: "Ally Sanctuary", price: 170, note: "2 people" },
    { key: "Student", label: "Student", price: 75, note: "1 person" }
  ];

  var joinRoot = document.getElementById("club-join-root");
  var waitlistInfo = document.getElementById("waitlist-info");
  var authBox = document.getElementById("club-auth");
  var memberBox = document.getElementById("club-member");
  var paymentBox = document.getElementById("club-payment");
  var successBox = document.getElementById("club-success");
  var authForm = document.getElementById("club-auth-form");
  var authError = document.getElementById("auth-error");
  var authSubmit = document.getElementById("auth-submit");
  var authNameField = document.getElementById("auth-name-field");
  var authName = document.getElementById("auth-name");
  var authEmail = document.getElementById("auth-email");
  var authPassword = document.getElementById("auth-password");
  var tabLogin = document.getElementById("auth-tab-login");
  var tabSignup = document.getElementById("auth-tab-signup");
  var memberDetails = document.getElementById("club-member-details");
  var tierPicker = document.getElementById("club-tier-picker");
  var studentNote = document.getElementById("student-note");
  var payBtn = document.getElementById("club-pay");
  var payError = document.getElementById("club-pay-error");
  var accountEmailEls = document.querySelectorAll(".club-account-email");
  var successDetails = document.getElementById("club-success-details");

  /* If the join markup is absent (an older copy of the page),
     the state banner above still works — this block just does
     nothing. */
  if (!joinRoot || !window.CCEPAuth || !window.CCEPPayments) { return; }

  var joinReady = false;   // initJoin ran for this open window
  var card = null;         // Square card object, once attached
  var cardFailed = false;  // SDK or attach failed; pay stays off
  var authMode = "login";  // "login" | "signup"

  function show(el, on) { if (el) { el.hidden = !on; } }

  /* scrollIntoView exists in every real browser; the guard
     keeps this file testable in environments without it. */
  function scrollToEl(el, block) {
    if (el && el.scrollIntoView) {
      el.scrollIntoView({ behavior: "smooth", block: block || "start" });
    }
  }

  function showJoinRoot(on) {
    show(joinRoot, on);
    show(waitlistInfo, !on);
  }

  function showOnly(box) {
    show(authBox, box === authBox);
    show(memberBox, box === memberBox);
    show(paymentBox, box === paymentBox);
    show(successBox, box === successBox);
  }

  function money(n) { return "$" + Number(n).toFixed(2).replace(/\.00$/, ""); }

  function niceDate(iso) {
    if (!iso) { return ""; }
    return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }

  function setAuthMode(mode) {
    authMode = mode;
    if (tabLogin) { tabLogin.setAttribute("aria-pressed", mode === "login" ? "true" : "false"); }
    if (tabSignup) { tabSignup.setAttribute("aria-pressed", mode === "signup" ? "true" : "false"); }
    show(authNameField, mode === "signup");
    if (authPassword) { authPassword.setAttribute("autocomplete", mode === "signup" ? "new-password" : "current-password"); }
    if (authSubmit) { authSubmit.textContent = mode === "signup" ? "Create account" : "Log in"; }
    if (authError) { authError.hidden = true; }
  }

  if (tabLogin) { tabLogin.addEventListener("click", function () { setAuthMode("login"); }); }
  if (tabSignup) { tabSignup.addEventListener("click", function () { setAuthMode("signup"); }); }

  function setAccountEmail(email) {
    accountEmailEls.forEach(function (el) { el.textContent = email || ""; });
  }

  function authFail(message) {
    if (authError) {
      authError.textContent = message;
      authError.hidden = false;
    }
  }

  function payFail(message) {
    if (payError) {
      payError.textContent = message;
      payError.hidden = false;
    }
  }

  function selectedTier() {
    var checked = tierPicker ? tierPicker.querySelector('input[name="club-tier"]:checked') : null;
    return checked ? checked.value : "";
  }

  function tierPrice(key) {
    for (var i = 0; i < TIERS.length; i++) {
      if (TIERS[i].key === key) { return TIERS[i].price; }
    }
    return 0;
  }

  function refreshPayButton() {
    if (!payBtn) { return; }
    var tier = selectedTier();
    payBtn.textContent = tier
      ? "Join — " + money(tierPrice(tier)) + " / year"
      : "Join the Sanctuary Club";
    payBtn.disabled = cardFailed;
    show(studentNote, tier === "Student");
  }

  function markSelectedLabels() {
    if (!tierPicker) { return; }
    tierPicker.querySelectorAll(".tier-option").forEach(function (label) {
      var input = label.querySelector('input[name="club-tier"]');
      label.classList.toggle("selected", !!(input && input.checked));
    });
  }

  if (tierPicker) {
    tierPicker.addEventListener("change", function () {
      markSelectedLabels();
      refreshPayButton();
      if (payError) { payError.hidden = true; }
    });
  }

  function buildTierPicker() {
    /* The fieldset already holds a <legend>, so "has children"
       is not the test — look for a radio instead. */
    if (!tierPicker || tierPicker.querySelector('input[name="club-tier"]')) { return; }
    TIERS.forEach(function (t) {
      var label = document.createElement("label");
      label.className = "tier-option";
      var input = document.createElement("input");
      input.type = "radio";
      input.name = "club-tier";
      input.value = t.key;
      var strong = document.createElement("strong");
      strong.textContent = t.label;
      var span = document.createElement("span");
      span.textContent = " — " + money(t.price) + " / year · " + t.note;
      label.appendChild(input);
      label.appendChild(strong);
      label.appendChild(span);
      tierPicker.appendChild(label);
    });
  }

  /* After login: check for an existing membership first, so a
     member never pays twice. */
  function afterLogin(account) {
    setAccountEmail(account ? account.email : "");
    if (payError) { payError.hidden = true; }
    CCEPAuth.apiFetch("/api/club-members/me", {}).then(function (r) {
      if (r.ok && r.data && r.data.status === "active") {
        showMember(r.data);
      } else {
        showPayment();
      }
    }).catch(function () {
      /* Membership check failed (network) — still show the
         payment form; a duplicate join is refused with 409
         and handled there. */
      showPayment();
    });
  }

  function showMember(m) {
    if (memberDetails) {
      memberDetails.textContent = "You're a " + m.tier + " member — joined " +
        niceDate(m.joinedAt) + ", active through " + niceDate(m.expiresAt) + ".";
    }
    showOnly(memberBox);
  }

  function showPayment() {
    buildTierPicker();
    markSelectedLabels();
    refreshPayButton();
    showOnly(paymentBox);
    ensureCard();
  }

  /* The card form is created once, the first time the payment
     form shows. The Square SDK loads from Square's CDN here. */
  function ensureCard() {
    if (card || cardFailed) { return; }
    var container = document.getElementById("club-card-container");
    if (!container) { cardFailed = true; refreshPayButton(); return; }
    CCEPPayments.createCard("club-card-container", "light").then(function (c) {
      card = c;
      refreshPayButton();
    }).catch(function (err) {
      cardFailed = true;
      refreshPayButton();
      payFail(err && err.message
        ? err.message
        : "The card form could not load. Check your connection and refresh the page.");
    });
  }

  if (authForm) {
    authForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (authError) { authError.hidden = true; }
      var email = (authEmail.value || "").trim();
      var password = authPassword.value || "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        authFail("Enter a valid email address.");
        authEmail.focus();
        return;
      }
      if (password.length < 8) {
        authFail("Your password needs at least 8 characters.");
        authPassword.focus();
        return;
      }
      authSubmit.disabled = true;
      authSubmit.textContent = authMode === "signup" ? "Creating account…" : "Logging in…";
      var done = authMode === "signup"
        ? CCEPAuth.signup((authName.value || "").trim(), email, password)
        : CCEPAuth.login(email, password);
      done.then(function (r) {
        authSubmit.disabled = false;
        setAuthMode(authMode);
        if (r.ok) {
          afterLogin(r.account);
          return;
        }
        if (r.status === 409) {
          authFail("An account with this email already exists — try logging in instead.");
        } else if (r.status === 401) {
          authFail("That email or password doesn't match our records.");
        } else if (r.data && r.data.details && r.data.details.length) {
          authFail(r.data.details[0]);
        } else {
          authFail("We couldn't reach the server. Check your connection and try again.");
        }
      }).catch(function () {
        authSubmit.disabled = false;
        setAuthMode(authMode);
        authFail("We couldn't reach the server. Check your connection and try again.");
      });
    });
  }

  function logoutAndShowAuth() {
    CCEPAuth.logout();
    /* The Square card object stays attached to its container —
       it belongs to the page, not the account — so a re-login
       reuses it instead of attaching a second card. */
    cardFailed = false; // a transient load failure may retry
    setAccountEmail("");
    setAuthMode("login");
    showOnly(authBox);
  }

  document.querySelectorAll("[data-club-logout]").forEach(function (btn) {
    btn.addEventListener("click", logoutAndShowAuth);
  });

  function joinErrorFor(r) {
    if (r.status === 402) {
      return "Your card was declined." +
        (r.data && r.data.message ? " " + r.data.message : "") +
        " Please try a different card.";
    }
    if (r.status === 409) {
      return "This account already has an active Sanctuary Club membership.";
    }
    if (r.status === 503) {
      return "Card payments aren't set up yet. Please try again later — your card was not charged.";
    }
    if (r.status === 401) {
      return "Your login expired. Please log in again.";
    }
    if (r.status === 400 && r.data && r.data.details && r.data.details.length) {
      return r.data.details.join(" ");
    }
    if (r.status === 500 && r.data && r.data.squarePaymentId) {
      return "Something went wrong after your payment went through. Keep this payment reference and contact us: " + r.data.squarePaymentId;
    }
    return "Something went wrong and your card was not charged. Please try again.";
  }

  if (payBtn) {
    payBtn.addEventListener("click", function () {
      if (payError) { payError.hidden = true; }
      var tier = selectedTier();
      if (!tier) {
        payFail("Choose a tier first.");
        scrollToEl(tierPicker, "center");
        return;
      }
      if (!card) {
        payFail("The card form is still loading. Give it a moment and try again.");
        return;
      }
      payBtn.disabled = true;
      payBtn.textContent = "Processing…";
      CCEPPayments.tokenize(card).then(function (t) {
        if (!t.ok) {
          payBtn.disabled = false;
          refreshPayButton();
          payFail(t.message);
          return;
        }
        return CCEPAuth.apiFetch("/api/club-members", {
          method: "POST",
          body: { tier: tier, sourceId: t.token }
        }).then(function (r) {
          payBtn.disabled = false;
          refreshPayButton();
          if (r.status === 201) {
            if (successDetails) {
              successDetails.textContent = "You're a " + r.data.tier + " member — " +
                money(r.data.price) + " / year, joined " + niceDate(r.data.joinedAt) +
                ", active through " + niceDate(r.data.expiresAt) + ".";
            }
            showOnly(successBox);
            scrollToEl(successBox, "start");
            return;
          }
          if (r.status === 401) {
            /* Session died mid-checkout: back to login, and the
               shopper can pick up where they left off. */
            logoutAndShowAuth();
            authFail("Your login expired. Please log in again.");
            return;
          }
          if (r.status === 409) {
            /* Already a member: show the membership instead of
               an error — the member panel is the message. */
            afterLogin(CCEPAuth.getAccount());
            return;
          }
          payFail(joinErrorFor(r));
        });
      }).catch(function () {
        payBtn.disabled = false;
        refreshPayButton();
        payFail("We couldn't reach the server. Check your connection and try again — your card was not charged.");
      });
    });
  }

  /* Entry point, called from setState when enrollment opens. */
  function initJoin() {
    if (joinReady) { return; }
    joinReady = true;
    setAuthMode("login");
    CCEPAuth.me().then(function (account) {
      if (account) { afterLogin(account); }
      else { showOnly(authBox); }
    }).catch(function () {
      showOnly(authBox);
    });
  }

  /* Initial view follows the date; the preview switcher (if
     present) still overrides by hand. Runs here, at the end,
     so the join flow above is fully assigned before setState
     can call initJoin(). */
  setState(autoState());

})();
