/* ============================================================
   Coffee & Connections El Paso — Main JavaScript
   connectionsep.com | v01 (2026-10-16)
   ------------------------------------------------------------
   RULE: No inline <script> in HTML files. All behavior lives here.
   ------------------------------------------------------------
   Resilience Check In slider:
   - 1-3  -> crisis resources (988 / 911 / local)
   - 4-6  -> breathing + grounding exercise, then 988
   - 7-10 -> thumbs up
   NOTE: This demo captures NO data. The production build wires
   the slider behind the account wall (demographics + zip) and
   submits to the Resilience Heat Map pipeline.
   ============================================================ */

(function () {
  'use strict';

  var slider = document.getElementById('checkin-slider');
  var score  = document.getElementById('checkin-score');
  var tierLow  = document.getElementById('tier-low');
  var tierMid  = document.getElementById('tier-mid');
  var tierHigh = document.getElementById('tier-high');

  // Bail quietly if this page has no slider (shared file, many pages)
  if (!slider || !score) { return; }

  function hideAllTiers() {
    [tierLow, tierMid, tierHigh].forEach(function (el) {
      if (el) { el.classList.remove('show'); }
    });
  }

  function update() {
    var value = parseInt(slider.value, 10);
    score.textContent = value;
    hideAllTiers();

    if (value <= 3) {
      if (tierLow) { tierLow.classList.add('show'); }
    } else if (value <= 6) {
      if (tierMid) { tierMid.classList.add('show'); }
    } else {
      if (tierHigh) { tierHigh.classList.add('show'); }
    }
  }

  slider.addEventListener('input', update);

  // Set initial state on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', update);
  } else {
    update();
  }
})();

/* ============================================================
   Check In page (checkin.html):
   - Step 1: About-you form. Only zip is required.
   - Step 2: Slider (1=struggling, 10=thriving).
   - Submit validates zip, then shows the tiered response.
   - Demo captures NO data. Production wires to the
     Resilience Heat Map pipeline (Vic's lane).
   ============================================================ */
(function () {
  'use strict';

  var form     = document.getElementById('checkin-form');
  var pageSlider = document.getElementById('checkin-page-slider');
  var pageScore  = document.getElementById('checkin-page-score');
  var submitBtn  = document.getElementById('checkin-submit');
  var resultBox  = document.getElementById('checkin-result');

  // Bail quietly — this block only runs on checkin.html
  if (!form || !pageSlider || !submitBtn) { return; }

  var zipInput = document.getElementById('f-zip');
  var zipError = document.getElementById('zip-error');
  var tierLow  = document.getElementById('page-tier-low');
  var tierMid  = document.getElementById('page-tier-mid');
  var tierHigh = document.getElementById('page-tier-high');
  var complete = document.getElementById('checkin-complete');
  var stateSelect = document.getElementById('state-select');

  // Live score readout as they slide (no tier shown yet — tiers fire on submit)
  pageSlider.addEventListener('input', function () {
    pageScore.textContent = pageSlider.value;
  });

  function hideTiers() {
    [tierLow, tierMid, tierHigh].forEach(function (el) {
      if (el) { el.classList.remove('show'); }
    });
    if (complete) { complete.hidden = true; }
    if (resultBox) { resultBox.hidden = true; }
  }

  function validZip() {
    var v = (zipInput.value || '').trim();
    var ok = /^[0-9]{5}$/.test(v);
    if (zipError) { zipError.hidden = ok; }
    zipInput.setAttribute('aria-invalid', ok ? 'false' : 'true');
    return ok;
  }

  // State dropdown filters resource cards (TX + national at launch)
  function filterResources() {
    if (!stateSelect) { return; }
    var want = stateSelect.value; // 'TX' or 'national'
    var cards = document.querySelectorAll('#resource-list .resource-card');
    cards.forEach(function (card) {
      var states = (card.getAttribute('data-states') || '').split(' ');
      card.hidden = states.indexOf(want) === -1;
    });
  }
  if (stateSelect) {
    stateSelect.addEventListener('change', filterResources);
    filterResources();
  }

  submitBtn.addEventListener('click', function () {
    if (!validZip()) {
      zipInput.focus();
      zipInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    hideTiers();
    var value = parseInt(pageSlider.value, 10);

    if (value <= 3) {
      if (tierLow) { tierLow.classList.add('show'); }
    } else if (value <= 6) {
      if (tierMid) { tierMid.classList.add('show'); }
    } else {
      if (tierHigh) { tierHigh.classList.add('show'); }
    }
    if (resultBox) {
      resultBox.hidden = false;
      resultBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (complete) { complete.hidden = false; }

    // NOTE: production build POSTs { zip, score, optional demographics }
    // to the Resilience Heat Map pipeline here. Demo stores nothing.
  });

  // Re-validate zip as they type (clear the error once fixed)
  zipInput.addEventListener('input', function () {
    if (zipError && !zipError.hidden) { validZip(); }
  });
})();
