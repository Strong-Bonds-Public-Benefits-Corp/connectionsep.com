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

/* ============================================================
   Resilience Heat Map (heat-map.html):
   - Leaflet + OpenStreetMap. No API key, no billing, no
     third-party data pipeline — the map runs on static Pages.
   - Default view: El Paso / Borderland. Zoom out for national.
   - One map, many lenses: the dimension dropdown FILTERS the
     same zip areas; it does not swap maps.
   - Suppression (published openly on the page):
     zip areas need 10+ check-ins; filtered views need 5+.
     Below that, the area shows grey ("not enough data yet").
   - DEMO DATA below. Production replaces the AREAS table and
     the OFFSETS with the aggregated pipeline file (Vic's lane):
     per zip, per dimension value: { count, avg } for cells that
     pass suppression. Name / alias / email never enter that
     file; birth year arrives only as an age band.
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

  // ---- Demo areas: [zip, lat, lng, overall average score] ----
  // Centroids are approximate; production uses real zip boundaries.
  var AREAS = [
    ['79901', 31.76, -106.49, 6.8],
    ['79902', 31.79, -106.48, 5.4],
    ['79903', 31.77, -106.44, 4.2],
    ['79905', 31.77, -106.42, 3.6],
    ['79907', 31.73, -106.43, 5.9],
    ['79912', 31.84, -106.58, 7.4],
    ['79924', 31.92, -106.43, 6.1],
    ['79925', 31.78, -106.37, 7.9],
    ['79928', 31.65, -106.27, 8.3],
    ['79930', 31.83, -106.46, 5.1],
    ['79932', 31.88, -106.58, 6.6],
    ['79934', 31.95, -106.40, 4.8],
    ['79936', 31.85, -106.35, 7.1],
    ['79938', 31.68, -106.30, 2.8],
    // Out-of-area demo points: zoom out to see national scope.
    ['77001', 29.76, -95.37, 6.3],
    ['10001', 40.71, -74.01, 5.7]
  ];

  // ---- Demo dimension values (match the check-in form options) ----
  var VALUES = {
    military: ['Active Duty', 'Veteran', 'National Guard / Reserve', 'Military spouse', 'Military family', 'Civilian'],
    age: ['Under 18', '18-25', '26-35', '36-45', '46-55', '56+'],
    college: ['UTEP', 'EPCC', 'Other college', 'Not a student'],
    race: ['American Indian or Alaska Native', 'Asian', 'Black or African American', 'Hispanic or Latino', 'Native Hawaiian or Pacific Islander', 'White', 'Two or more races']
  };

  // Demo score offsets per group (production uses real aggregates).
  var OFFSETS = {
    military: { 'Active Duty': 0.3, 'Veteran': -0.4, 'National Guard / Reserve': 0.1, 'Military spouse': -0.6, 'Military family': -0.2, 'Civilian': 0.5 },
    age: { 'Under 18': -0.8, '18-25': -0.5, '26-35': 0.2, '36-45': 0.4, '46-55': 0.6, '56+': 0.3 },
    college: { 'UTEP': -0.3, 'EPCC': -0.1, 'Other college': 0.2, 'Not a student': 0.4 },
    race: { 'American Indian or Alaska Native': -0.5, 'Asian': 0.4, 'Black or African American': -0.3, 'Hispanic or Latino': -0.1, 'Native Hawaiian or Pacific Islander': -0.2, 'White': 0.3, 'Two or more races': 0.0 }
  };

  var THRESH_ZIP = 10;     // published on the page
  var THRESH_FILTER = 5;   // published on the page
  var DEMO_N_ZIP = 1000;   // demo: check-ins per zip, all view
  var DEMO_N_FILTER = 500; // demo: check-ins per filtered cell

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
    if (n >= 1000) { return 18; }
    if (n >= 500) { return 15; }
    return 10;
  }

  function clampScore(v) {
    if (v < 1) { return 1; }
    if (v > 10) { return 10; }
    return Math.round(v * 10) / 10;
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

  function render() {
    var f = currentFilter();
    layer.clearLayers();
    var shown = 0;
    var total = 0;
    var suppressed = 0;

    AREAS.forEach(function (a) {
      var zip = a[0], lat = a[1], lng = a[2], base = a[3];
      var n, avg, thresh, label;

      if (f.dim === 'all') {
        n = DEMO_N_ZIP; avg = base; thresh = THRESH_ZIP; label = 'All check-ins';
      } else {
        // Demo suppressed cell: 79938 + Age 56+ has only 3 check-ins,
        // below the filtered threshold of 5 — shows grey on purpose.
        if (zip === '79938' && f.dim === 'age' && f.val === '56+') {
          n = 3;
        } else {
          n = DEMO_N_FILTER;
        }
        avg = clampScore(base + (OFFSETS[f.dim][f.val] || 0));
        thresh = THRESH_FILTER; label = f.val;
      }

      if (n < thresh) {
        suppressed += 1;
        L.circleMarker([lat, lng], {
          radius: 10, color: '#8a8a8a', weight: 2, fillColor: '#8a8a8a', fillOpacity: 0.55
        }).bindPopup('<strong>Zip ' + zip + '</strong><br>' + label +
          '<br>Not enough data yet — fewer than ' + thresh + ' check-ins in this view.').addTo(layer);
        return;
      }

      shown += 1;
      total += n;
      L.circleMarker([lat, lng], {
        radius: radiusFor(n), color: '#fdf5e6', weight: 1.5,
        fillColor: colorFor(avg), fillOpacity: 0.85
      }).bindPopup('<strong>Zip ' + zip + '</strong><br>' + label +
        '<br>Average: ' + avg.toFixed(1) + ' / 10<br>' +
        n.toLocaleString() + ' check-ins (demo)').addTo(layer);
    });

    if (statsEl) {
      var lens = (f.dim === 'all') ? 'All check-ins' : f.val;
      var extra = suppressed ? ' · ' + suppressed + ' area(s) with too few check-ins to show' : '';
      statsEl.textContent = 'Showing: ' + lens + ' · ' + shown + ' areas · ' +
        total.toLocaleString() + ' check-ins (demo data)' + extra;
    }
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
    render();
  }

  if (dimSelect) { dimSelect.addEventListener('change', rebuildValues); }
  if (valSelect) { valSelect.addEventListener('change', render); }

  // Time-range buttons update the label; demo data is static.
  var rangeBtns = document.querySelectorAll('.range-btn[data-range]');
  rangeBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      rangeBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      if (rangeLabel) {
        rangeLabel.textContent = 'Showing: last ' + btn.getAttribute('data-range') + ' (demo data).';
      }
      render();
    });
  });

  rebuildValues();
})();
