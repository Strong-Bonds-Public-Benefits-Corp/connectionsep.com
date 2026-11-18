/* Survivor Journal — removal pages (js/removal.js).
   One script for all three removal pages. Each page carries
   data-removal-action on <body> ("request-removal", "confirm-removal",
   or "restore-removal") and reads ?story=<id>&token=<token> from the URL.
   The action fires ONLY on an explicit button click — never on page load —
   so a link preview or prefetch cannot trigger it.
   No story content is ever shown on these pages. The Vault base URL is a
   public endpoint, not a credential. For local testing, set
   window.SURVIVOR_JOURNAL_VAULT_URL before this script runs. */

(function () {
  "use strict";

  var VAULT_API_URL = window.SURVIVOR_JOURNAL_VAULT_URL || "https://strong-bonds-vault.onrender.com";
  var action = document.body.getAttribute("data-removal-action") || "";
  var btn = document.getElementById("removal-action-btn");
  var statusEl = document.getElementById("removal-status");
  var params = new URLSearchParams(window.location.search);
  var storyId = params.get("story") || "";
  var token = params.get("token") || "";

  if (!storyId || !token || !action) {
    if (statusEl) {
      statusEl.textContent = "This link is missing the story or the removal code. Please use the link from the email exactly as it was sent.";
    }
    if (btn) { btn.disabled = true; }
    return;
  }

  btn.addEventListener("click", async function () {
    btn.disabled = true;
    statusEl.textContent = "Working…";
    try {
      var res = await fetch(VAULT_API_URL + "/api/stories/" + encodeURIComponent(storyId) + "/" + action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token }),
      });
      var data = null;
      try { data = await res.json(); } catch (err) { /* non-JSON body */ }
      if (res.ok && data && data.message) {
        statusEl.textContent = data.message;
      } else if (data && data.error) {
        statusEl.textContent = data.error;
        btn.disabled = false;
      } else {
        statusEl.textContent = "This could not be completed right now. Please try again.";
        btn.disabled = false;
      }
    } catch (err) {
      statusEl.textContent = "This could not be completed right now. Please try again.";
      btn.disabled = false;
    }
  });
})();
