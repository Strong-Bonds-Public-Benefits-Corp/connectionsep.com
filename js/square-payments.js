/* ============================================================
   Coffee & Connections El Paso — Square Web Payments SDK
   connectionsep.com | v01 (2026-11-16)
   ------------------------------------------------------------
   Shared card-form helper for the Sanctuary Club join
   (club.html) and the Resilience Market checkout
   (market.html). Loads Square's Web Payments SDK, renders
   the card entry form, and tokenizes the card to a sourceId
   the backend charges. The card number never touches our
   servers and never touches this code — tokenization happens
   inside Square's iframe.
   ------------------------------------------------------------
   PUBLIC values only. The Square access token is NEVER in
   this file (or any frontend file) — it stays server-side
   in Render. Application ID sq0idp-rQoMDP3eiD6GFM52EYUj4w
   and Location ID LAQ81T48K7FB7 are public by design: the
   SDK needs them in the browser to tokenize.
   ============================================================ */
(function () {
  'use strict';

  var SQUARE_APP_ID = 'sq0idp-rQoMDP3eiD6GFM52EYUj4w';
  var SQUARE_LOCATION_ID = 'LAQ81T48K7FB7';
  var SDK_URL = 'https://web.squarecdn.com/v1/square.js';

  var sdkPromise = null;

  /* Load the SDK script once, however many forms use it. */
  function loadSdk() {
    if (sdkPromise) { return sdkPromise; }
    if (window.Square) {
      sdkPromise = Promise.resolve();
      return sdkPromise;
    }
    sdkPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = SDK_URL;
      script.async = true;
      script.onload = function () {
        if (window.Square) { resolve(); }
        else { reject(new Error('Square payments could not load.')); }
      };
      script.onerror = function () {
        reject(new Error('Square payments could not load. Check your connection and try again.'));
      };
      document.head.appendChild(script);
    });
    return sdkPromise;
  }

  /* Card input styling. 'dark' matches the market's dark
     forms; 'light' matches the club page's light inputs.
     If Square ever rejects the style object, the card still
     renders with its default look — styling never blocks
     payment. */
  function cardStyle(variant) {
    if (variant === 'light') {
      return {
        input: {
          backgroundColor: '#fdf5e6',
          color: '#1a0f0a',
          fontFamily: "'Open Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          fontSize: '17px'
        },
        '.input-container': { borderColor: '#4a3524', borderRadius: '8px' },
        '.input-container.is-focus': { borderColor: '#d4af37' },
        '.input-container.is-error': { borderColor: '#c0392b' },
        '.message-text': { color: '#8a3a32' },
        'input::placeholder': { color: '#8a7a64' }
      };
    }
    return {
      input: {
        backgroundColor: '#241610',
        color: '#fdf5e6',
        fontFamily: "'Open Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        fontSize: '15px'
      },
      '.input-container': { borderColor: '#4a3524', borderRadius: '8px' },
      '.input-container.is-focus': { borderColor: '#d4af37' },
      '.input-container.is-error': { borderColor: '#c0392b' },
      '.message-text': { color: '#f0a0a0' },
      'input::placeholder': { color: '#8a6f5c' }
    };
  }

  /* Render the card form into #containerId. Resolves with the
     Square card object, ready to tokenize. Rejects if the SDK
     fails to load or the form cannot attach. */
  function createCard(containerId, variant) {
    return loadSdk().then(function () {
      var payments = window.Square.payments(SQUARE_APP_ID, SQUARE_LOCATION_ID);
      return payments.card({ style: cardStyle(variant || 'dark') });
    }).then(function (card) {
      return card.attach('#' + containerId).then(function () { return card; });
    });
  }

  /* Tokenize the card to a sourceId. Resolves
     { ok: true, token } on success, or { ok: false, message }
     with a plain-language reason — never throws for a card
     problem (a declined/invalid card is a message, not an
     exception). */
  function tokenize(card) {
    return card.tokenize().then(function (result) {
      if (result.status === 'OK' && result.token) {
        return { ok: true, token: result.token };
      }
      var errors = result.errors || [];
      var detail = (errors.length && errors[0].detail)
        ? errors[0].detail
        : 'Check the card details and try again.';
      return { ok: false, message: detail };
    });
  }

  window.CCEPPayments = {
    loadSdk: loadSdk,
    createCard: createCard,
    tokenize: tokenize
  };
})();
