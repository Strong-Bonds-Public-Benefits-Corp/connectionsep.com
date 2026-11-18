/* Survivor Journal: Your Story — Vault wiring (js/journal.js).
   Fetches the approved feed into the book (Chapter 4+) and owns the
   submission form. The book itself (founder chapters, page-turning) lives
   in js/book.js; this file appends approved stories through
   window.appendJournalPages.

   SUBMISSIONS_OPEN gates the form. It is false until Tony says open —
   the gates (CSFLE, BAA, Marylou's sign-off, Block 3 decided, live email
   proof + sweep, Tony's go-ahead + domain connect) have not closed.
   While closed, the under-construction placeholder shows, the form is
   disabled, and the submit handler refuses to send anything.

   The Vault base URL is a public endpoint, not a credential — the same
   pattern as the public API URL in main.js. No token, secret, or Vault
   credential ever goes in this file. For local testing, set
   window.SURVIVOR_JOURNAL_VAULT_URL before this script runs. */

(function () {
  "use strict";

  /* ---------- Config ---------- */
  var VAULT_API_URL = window.SURVIVOR_JOURNAL_VAULT_URL || "https://strong-bonds-vault.onrender.com";
  /* Flip to true ONLY when Tony opens submissions. Until then the form
     stays closed behind the under-construction placeholder. The
     window.SURVIVOR_JOURNAL_SUBMISSIONS_OPEN override exists ONLY so the
     local test harness can exercise the form against a test Vault — it is
     unset in production, so the form stays closed. */
  var SUBMISSIONS_OPEN = window.SURVIVOR_JOURNAL_SUBMISSIONS_OPEN === true;

  var MESSAGE_MAX_CHARS = 10000;
  var NAME_MAX_CHARS = 100;
  var ALLOWED_TAGS = [
    "Domestic Violence", "Sexual Assault", "Military Sexual Trauma", "PTSD",
    "Depression", "Anxiety", "Grief", "Suicide", "Suicide Loss", "Isolation"
  ];

  /* ---------- Tag display map ----------
     Legacy Vault data stores abbreviated tags. The Book NEVER shows
     abbreviations (Tony's standing rule: spell out Domestic Violence and
     Sexual Assault). Full-word tags pass through unchanged. */
  var TAG_DISPLAY = {
    "DV": "Domestic Violence",
    "SUI": "Suicide",
    "MH": "Mental Health",
    "PTSD": "PTSD",
    "MST": "Military Sexual Trauma",
    "SA": "Sexual Assault"
  };
  function displayTag(tag) { return TAG_DISPLAY[tag] || tag; }

  /* ---------- Approved feed → book chapters ---------- */
  var feedStatusEl = document.getElementById("vault-feed-status");
  var loadMoreBtn = document.getElementById("vault-load-more");
  var feedCount = 0;
  var nextAfter = null;
  var feedLoading = false;

  /* A feed story becomes a book page. Title is the display name; the
     byline carries the city ("from El Paso") or the sharing choice. */
  function storyToPage(story) {
    var title = "Anonymous";
    var byline = "Shared anonymously";
    if (story.displayType === "first_name" && story.displayName) {
      title = story.displayName;
      byline = story.city ? "from " + story.city : "";
    } else if (story.displayType === "alias" && story.displayName) {
      title = story.displayName;
      byline = "Shared under an alias";
    }
    var paragraphs = String(story.message || "")
      .split(/\n\s*\n/)
      .map(function (p) { return p.trim(); })
      .filter(function (p) { return p.length > 0; });
    if (paragraphs.length === 0) { paragraphs = [""]; }
    return {
      title: title,
      byline: byline,
      paragraphs: paragraphs,
      tags: (story.tags || []).map(displayTag),
    };
  }

  function setFeedStatus() {
    if (!feedStatusEl) { return; }
    if (feedCount === 0) {
      feedStatusEl.textContent = "Chapter 4 opens when the first community story is approved. Until then, the Book opens with its three hard-coded chapters and waits — it never opens empty.";
    } else {
      feedStatusEl.textContent = feedCount + (feedCount === 1
        ? " approved community story is in the Book."
        : " approved community stories are in the Book.");
    }
  }

  function updateLoadMore() {
    if (!loadMoreBtn) { return; }
    loadMoreBtn.hidden = !nextAfter;
    loadMoreBtn.disabled = feedLoading;
  }

  async function loadFeed(after) {
    if (feedLoading) { return; }
    feedLoading = true;
    updateLoadMore();
    var url = VAULT_API_URL + "/api/stories/approved";
    if (after) { url += "?after=" + encodeURIComponent(after); }
    try {
      var res = await fetch(url);
      if (!res.ok) { throw new Error("feed unavailable"); }
      var data = await res.json();
      var stories = Array.isArray(data.stories) ? data.stories : [];
      nextAfter = data.nextAfter || null;
      if (stories.length > 0 && typeof window.appendJournalPages === "function") {
        feedCount += window.appendJournalPages(stories.map(storyToPage));
      }
      setFeedStatus();
    } catch (err) {
      /* The Vault cannot be reached. The Book still opens with its three
         founder chapters — it never opens empty. Leave the default
         "never opens empty" status in place; do not alarm the reader. */
      nextAfter = null;
      setFeedStatus();
    } finally {
      feedLoading = false;
      updateLoadMore();
    }
  }

  if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", function () {
      if (nextAfter) { loadFeed(nextAfter); }
    });
  }
  loadFeed(null);

  /* ---------- Submission form ---------- */
  var form = document.getElementById("story-form");
  var placeholderEl = document.getElementById("under-construction");
  var statusEl = document.getElementById("form-status");
  var submitBtn = form ? form.querySelector('button[type="submit"]') : null;
  var messageInput = document.getElementById("message-input");
  var consentInput = document.getElementById("consent-input");
  var emailInput = document.getElementById("email-input");
  var aliasInput = document.getElementById("alias-input");
  var firstnameInput = document.getElementById("firstname-input");
  var cityInput = document.getElementById("city-input");
  var nameFieldsEl = document.getElementById("name-fields");

  function selectedDisplay() {
    var checked = form.querySelector('input[name="display"]:checked');
    return checked ? checked.value : "anonymous";
  }

  function refreshNameFields() {
    var mode = selectedDisplay();
    var showFirstName = mode === "first_name";
    var showAlias = mode === "alias";
    if (nameFieldsEl) { nameFieldsEl.hidden = !showFirstName; }
    if (firstnameInput) { firstnameInput.disabled = !showFirstName || !SUBMISSIONS_OPEN; }
    if (cityInput) { cityInput.disabled = !showFirstName || !SUBMISSIONS_OPEN; }
    if (aliasInput) { aliasInput.disabled = !showAlias || !SUBMISSIONS_OPEN; }
    if (showFirstName && firstnameInput && SUBMISSIONS_OPEN) { firstnameInput.focus(); }
    else if (showAlias && aliasInput && SUBMISSIONS_OPEN) { aliasInput.focus(); }
  }

  function setFormEnabled(open) {
    if (!form) { return; }
    if (placeholderEl) { placeholderEl.hidden = open; }
    var controls = form.querySelectorAll("input, textarea, button, fieldset");
    controls.forEach(function (el) { el.disabled = !open; });
    if (submitBtn) {
      submitBtn.textContent = open ? "Send my story for review" : "Story submissions open soon";
    }
    if (open) { refreshNameFields(); }
    if (statusEl) { statusEl.textContent = ""; }
  }

  /* The gate. While false the placeholder shows, the form is disabled,
     and the submit handler refuses to send anything. */
  setFormEnabled(SUBMISSIONS_OPEN);

  form.querySelectorAll('input[name="display"]').forEach(function (radio) {
    radio.addEventListener("change", refreshNameFields);
  });

  function checkedTags() {
    var tags = [];
    form.querySelectorAll('input[name="tags"]:checked').forEach(function (box) {
      tags.push(box.value);
    });
    return tags;
  }

  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!SUBMISSIONS_OPEN) {
      if (statusEl) {
        statusEl.textContent = "Story submissions aren't open yet. When they open, your story will go to the Vault for review before appearing in the Journal.";
      }
      return;
    }
    var message = messageInput.value.trim();
    var consent = consentInput.checked;
    var mode = selectedDisplay();
    var tags = checkedTags();
    var email = emailInput.value.trim();
    if (!message) {
      statusEl.textContent = "Please write your story first — even one sentence is enough.";
      return;
    }
    if (message.length > MESSAGE_MAX_CHARS) {
      statusEl.textContent = "Stories are limited to " + MESSAGE_MAX_CHARS + " characters.";
      return;
    }
    if (!consent) {
      statusEl.textContent = "Please check the consent box before sending.";
      return;
    }
    if (mode === "first_name") {
      if (!firstnameInput.value.trim()) {
        statusEl.textContent = "Please add your first name, or choose anonymous or an alias instead.";
        return;
      }
      if (!cityInput.value.trim()) {
        statusEl.textContent = "Please add your city, or choose anonymous or an alias instead.";
        return;
      }
      if (firstnameInput.value.trim().length > NAME_MAX_CHARS || cityInput.value.trim().length > NAME_MAX_CHARS) {
        statusEl.textContent = "Names and cities are limited to 100 characters.";
        return;
      }
    }
    if (mode === "alias") {
      if (!aliasInput.value.trim()) {
        statusEl.textContent = "Please add an alias, or choose anonymous or your first name instead.";
        return;
      }
      if (aliasInput.value.trim().length > NAME_MAX_CHARS) {
        statusEl.textContent = "An alias is limited to 100 characters.";
        return;
      }
    }
    if (tags.length === 0) {
      statusEl.textContent = "Please pick at least one tag for your story.";
      return;
    }
    if (tags.some(function (t) { return ALLOWED_TAGS.indexOf(t) === -1; })) {
      statusEl.textContent = "One of the topics chosen is not recognized.";
      return;
    }
    if (email && !validEmail(email)) {
      statusEl.textContent = "The email address does not look valid.";
      return;
    }

    var body = {
      displayType: mode,
      message: message,
      tags: tags,
      consentGiven: true,
    };
    if (mode === "first_name") {
      body.firstName = firstnameInput.value.trim();
      body.city = cityInput.value.trim();
    }
    if (mode === "alias") {
      body.alias = aliasInput.value.trim();
    }
    if (email) { body.email = email; }

    submitBtn.disabled = true;
    statusEl.textContent = "Sending your story for review…";
    try {
      var res = await fetch(VAULT_API_URL + "/api/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      var data = null;
      try { data = await res.json(); } catch (err) { /* non-JSON body */ }
      if (res.status === 201 && data) {
        /* Pending confirmation. The response never echoes the story text
           back, and neither do we. */
        var reviewBy = data.reviewBy ? new Date(data.reviewBy).toLocaleString() : "";
        statusEl.textContent = "Thank you. Your story was received and is waiting for review"
          + (reviewBy ? " (review by " + reviewBy + ")" : "")
          + ". Your story ID is " + data.storyId
          + " — keep it if you want to ask about your story. It will not appear in the Journal until a person has reviewed it.";
        form.reset();
        refreshNameFields();
      } else if (data && data.error) {
        statusEl.textContent = data.error;
      } else {
        statusEl.textContent = "Your story could not be received right now. Please try again.";
      }
    } catch (err) {
      statusEl.textContent = "Your story could not be received right now. Please try again.";
    } finally {
      submitBtn.disabled = !SUBMISSIONS_OPEN;
    }
  });
})();
