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
   NOTE: The home-page slider is a teaser only — it captures
   no data. The real check-in lives on checkin.html.
   ============================================================ */

/* API base for the live public API (Render). One constant for the
   whole file: check-ins POST here, the Heat Map GETs here. */
var API_URL = 'https://ccep-public-api.onrender.com';

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
   - Submit validates zip, then POSTs { score, zip, optional
     demographics } to POST /api/check-ins. The response mints
     one unique discount code, shown on the completion screen.
   - Store-order fields (name, address, phone, email) are never
     sent with a check-in.
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
  var submitError = document.getElementById('submit-error');
  var discountCodeEl = document.getElementById('discount-code');
  var discountExpiryEl = document.getElementById('discount-expiry');
  var discountExpiresEl = document.getElementById('discount-expires');
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

  // Branch of service only applies with a military connection.
  // Civilians and "Prefer not to say" never see it, and a hidden
  // Branch value is cleared so stale data can't submit.
  var militarySelect = document.getElementById('f-military');
  var branchWrap = document.getElementById('branch-wrap');
  var branchSelect = document.getElementById('f-branch');
  function toggleBranch() {
    if (!militarySelect || !branchWrap) { return; }
    var show = ['Active Duty', 'Veteran', 'National Guard / Reserve',
      'Military spouse', 'Military family'].indexOf(militarySelect.value) !== -1;
    branchWrap.hidden = !show;
    if (!show && branchSelect) { branchSelect.value = ''; }
  }
  if (militarySelect) {
    militarySelect.addEventListener('change', toggleBranch);
    toggleBranch();
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
    if (submitError) { submitError.hidden = true; }
    hideTiers();

    var value = parseInt(pageSlider.value, 10);
    var body = { score: value, zip: (zipInput.value || '').trim() };
    var birthYear = parseInt(((document.getElementById('f-birthyear') || {}).value || ''), 10);
    if (!isNaN(birthYear)) {
      if (birthYear < 1900 || birthYear > new Date().getFullYear()) {
        if (submitError) {
          submitError.textContent = 'Please enter a valid 4-digit birth year, or leave it blank.';
          submitError.hidden = false;
        }
        return;
      }
      body.birthYear = birthYear;
    }
    var race = ((document.getElementById('f-race') || {}).value || '');
    if (race) { body.raceEthnicity = race; }
    var military = ((document.getElementById('f-military') || {}).value || '');
    if (military) { body.militaryConnection = military; }
    var branch = ((document.getElementById('f-branch') || {}).value || '');
    if (branch) { body.branch = branch; }
    var college = ((document.getElementById('f-college') || {}).value || '');
    if (college) { body.college = college; }
    var alias = (((document.getElementById('f-alias') || {}).value || '').trim());
    if (alias) { body.alias = alias; }
    // Store-order fields (name, address, phone, email) are never
    // sent with a check-in. The API strips them too, but they
    // never leave the page at all.

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    fetch(API_URL + '/api/check-ins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (resp) {
      if (!resp.ok) { throw new Error('check-in failed: ' + resp.status); }
      return resp.json();
    }).then(function (data) {
      if (value <= 3) {
        if (tierLow) { tierLow.classList.add('show'); }
      } else if (value <= 6) {
        if (tierMid) { tierMid.classList.add('show'); }
      } else {
        if (tierHigh) { tierHigh.classList.add('show'); }
      }
      if (data.discountCode && discountCodeEl) {
        discountCodeEl.textContent = data.discountCode;
      }
      if (data.expiresAt && discountExpiresEl) {
        discountExpiresEl.textContent = new Date(data.expiresAt).toLocaleDateString('en-US', {
          month: 'long', day: 'numeric', year: 'numeric'
        });
        if (discountExpiryEl) { discountExpiryEl.hidden = false; }
      }
      if (resultBox) {
        resultBox.hidden = false;
        resultBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      if (complete) { complete.hidden = false; }
      submitBtn.textContent = 'Check-in complete';
      // Button stays disabled: one check-in per visit.
    }).catch(function () {
      if (submitError) { submitError.hidden = false; }
      submitBtn.disabled = false;
      submitBtn.textContent = 'Complete my Check In';
    });
  });

  // Re-validate zip as they type (clear the error once fixed)
  zipInput.addEventListener('input', function () {
    if (zipError && !zipError.hidden) { validZip(); }
  });
})();

/* ============================================================
   Resilience Heat Map (heat-map.html):
   - Leaflet + OpenStreetMap. No API key, no billing.
   - Default view: El Paso / Borderland. Zoom out for national.
   - One map, many lenses: the dimension dropdown FILTERS the
     same zip areas; it does not swap maps.
   - LIVE DATA: this block fetches GET /api/heat-map from the
     public API on every lens or range change. The API returns
     one row per zip: { zip, averageScore, checkInCount,
     suppressed, status }. Suppression (published openly on the
     page): zip areas need 10+ check-ins; filtered views need
     5+. Below that, the area shows grey ("not enough data
     yet"). Name / alias / email never enter the pipeline;
     birth year arrives only as an age band.
   - ZIP_COORDS below is only a zip -> map-pin lookup (the API
     returns no coordinates). A zip the API returns with no
     entry here is counted in the totals but not drawn.
   ============================================================ */
(function () {
  'use strict';

  var mapEl = document.getElementById('heat-map');

  // Bail quietly — this block only runs on heat-map.html
  if (!mapEl) { return; }

  var dimSelect = document.getElementById('hm-dimension');
  var valSelect = document.getElementById('hm-value');
  var statsEl = document.getElementById('hm-stats');
  var rangeLabel = document.getElementById('hm-range-label');

  // Leaflet comes from CDN. If it failed to load (offline),
  // say so plainly instead of showing a dead box.
  if (typeof L === 'undefined') {
    mapEl.innerHTML = '<p style="padding:24px">The map could not load. Check your connection and refresh the page.</p>';
    return;
  }

  // ---- Zip centroids (approximate) for the map pins. ----
  var ZIP_COORDS = {
    '79901': [31.76, -106.49], '79902': [31.79, -106.48],
    '79903': [31.77, -106.44], '79905': [31.77, -106.42],
    '79907': [31.73, -106.43], '79912': [31.84, -106.58],
    '79924': [31.92, -106.43], '79925': [31.78, -106.37],
    '79928': [31.65, -106.27], '79930': [31.83, -106.46],
    '79932': [31.88, -106.58], '79934': [31.95, -106.40],
    '79936': [31.85, -106.35], '79938': [31.68, -106.30],
    '77001': [29.76, -95.37], '10001': [40.71, -74.01]
  };

  // ---- Dimension values (match the check-in form options) ----
  var VALUES = {
    military: ['Active Duty', 'Veteran', 'National Guard / Reserve', 'Military spouse', 'Military family', 'Civilian'],
    branch: ['Army', 'Marine Corps', 'Navy', 'Air Force', 'Space Force', 'Coast Guard'],
    age: ['Under 18', '18-25', '26-35', '36-45', '46-55', '56+'],
    college: ['UTEP', 'EPCC', 'Other college', 'Not a student'],
    race: ['American Indian or Alaska Native', 'Asian', 'Black or African American', 'Hispanic or Latino', 'Native Hawaiian or Pacific Islander', 'White', 'Two or more races']
  };

  // Time range: button label -> API range parameter.
  var RANGES = { '7 days': '7d', '30 days': '30d', 'All time': 'all' };
  var currentRange = '30d';

  // Brand color scale: endpoints are exact brand colors, midpoints
  // are blends of them. No color repeats across tiers. Grey is not
  // a data color — it means suppressed, by convention.
  function colorFor(avg) {
    if (avg < 3) { return '#2c1b14'; } // deep brown
    if (avg < 5) { return '#4e2753'; } // deep purple
    if (avg < 6.5) { return '#8a5aa6'; } // mid purple blend
    if (avg < 8) { return '#d8b4fe'; } // light purple
    return '#d4af37'; // gold
  }

  function radiusFor(n) {
    if (n >= 100) { return 18; }
    if (n >= 50) { return 15; }
    return 10;
  }

  var map = L.map('heat-map').setView([31.76, -106.49], 11);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  var layer = L.layerGroup().addTo(map);

  function currentFilter() {
    var dim = dimSelect ? dimSelect.value : 'all';
    var val = valSelect ? valSelect.value : '';
    if (dim === 'all' || !val) { return { dim: 'all', val: '' }; }
    return { dim: dim, val: val };
  }

  function renderFromApi(data) {
    layer.clearLayers();
    var shown = (data.totals && data.totals.areasShown) || 0;
    var suppressed = (data.totals && data.totals.areasSuppressed) || 0;
    var total = (data.totals && data.totals.totalCheckIns) || 0;
    var thresh = data.threshold || 10;
    var f = currentFilter();
    var lens = (f.dim === 'all') ? 'All check-ins' : f.val;

    (data.zips || []).forEach(function (row) {
      var coords = ZIP_COORDS[row.zip];
      if (!coords) { return; } // counted in totals, not drawn
      if (row.suppressed) {
        L.circleMarker(coords, {
          radius: 10, color: '#8a8a8a', weight: 2, fillColor: '#8a8a8a', fillOpacity: 0.55
        }).bindPopup('<strong>Zip ' + row.zip + '</strong><br>' + lens +
          '<br>Not enough data yet — fewer than ' + thresh + ' check-ins in this view.').addTo(layer);
        return;
      }
      L.circleMarker(coords, {
        radius: radiusFor(row.checkInCount), color: '#fdf5e6', weight: 1.5,
        fillColor: colorFor(row.averageScore), fillOpacity: 0.85
      }).bindPopup('<strong>Zip ' + row.zip + '</strong><br>' + lens +
        '<br>Average: ' + Number(row.averageScore).toFixed(1) + ' / 10<br>' +
        Number(row.checkInCount).toLocaleString() + ' check-ins').addTo(layer);
    });

    if (statsEl) {
      var extra = suppressed ? ' · ' + suppressed + ' area(s) with too few check-ins to show' : '';
      statsEl.textContent = 'Showing: ' + lens + ' · ' + shown + ' areas · ' +
        total.toLocaleString() + ' check-ins' + extra;
    }
  }

  function fetchHeatMap() {
    var f = currentFilter();
    var url = API_URL + '/api/heat-map?dimension=' + encodeURIComponent(f.dim) +
      '&range=' + encodeURIComponent(currentRange);
    if (f.val) { url += '&value=' + encodeURIComponent(f.val); }
    if (statsEl) { statsEl.textContent = 'Loading the live map…'; }
    fetch(url).then(function (resp) {
      if (!resp.ok) { throw new Error('heat map failed: ' + resp.status); }
      return resp.json();
    }).then(function (data) {
      renderFromApi(data);
      if (rangeLabel) {
        var rangeText = (currentRange === 'all') ? 'all time' : 'last ' + currentRange.replace('d', ' days');
        rangeLabel.textContent = 'Showing: ' + rangeText + '.';
      }
    }).catch(function () {
      if (statsEl) { statsEl.textContent = 'The live map could not load. Check your connection and refresh the page.'; }
    });
  }

  // Dimension dropdown rebuilds the group dropdown.
  function rebuildValues() {
    var dim = dimSelect.value;
    valSelect.innerHTML = '';
    if (dim === 'all' || !VALUES[dim]) {
      var optAll = document.createElement('option');
      optAll.value = ''; optAll.textContent = 'All groups';
      valSelect.appendChild(optAll);
      valSelect.disabled = true;
    } else {
      valSelect.disabled = false;
      VALUES[dim].forEach(function (v) {
        var o = document.createElement('option');
        o.value = v; o.textContent = v;
        valSelect.appendChild(o);
      });
    }
    fetchHeatMap();
  }

  if (dimSelect) { dimSelect.addEventListener('change', rebuildValues); }
  if (valSelect) { valSelect.addEventListener('change', fetchHeatMap); }

  // Time-range buttons re-fetch the live map for the new range.
  var rangeBtns = document.querySelectorAll('.range-btn[data-range]');
  rangeBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      rangeBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentRange = RANGES[btn.getAttribute('data-range')] || '30d';
      fetchHeatMap();
    });
  });

  rebuildValues();
})();
