/* ============================================================
   Coffee & Connections El Paso — shared accounts helper
   connectionsep.com | v01 (2026-11-16)
   ------------------------------------------------------------
   The public API's accounts endpoints (POST /api/accounts,
   POST /api/auth/login, GET /api/accounts/me) live server-side;
   this file is the frontend's half: login/signup call these
   helpers, the token lives in localStorage, and authenticated
   requests send it as an Authorization header. The token is
   never written into the page.
   ------------------------------------------------------------
   NOTE: there was no login flow on the site before this file —
   the accounts endpoints existed server-side only. Club join
   (login required) and market checkout (guest allowed, login
   attaches the order to an account) both use this helper.
   ============================================================ */
(function () {
  'use strict';

  var API_URL = 'https://ccep-public-api.onrender.com';
  var TOKEN_KEY = 'ccep_token';
  var ACCOUNT_KEY = 'ccep_account';

  function getToken() {
    try { return window.localStorage.getItem(TOKEN_KEY) || ''; }
    catch (e) { return ''; }
  }

  function getAccount() {
    try {
      var raw = window.localStorage.getItem(ACCOUNT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function saveSession(token, account) {
    try {
      window.localStorage.setItem(TOKEN_KEY, token);
      window.localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account || null));
    } catch (e) {
      /* Private mode / storage blocked: the session lasts for
         this page load only. Nothing breaks — the token is just
         not persisted. */
    }
  }

  function clearSession() {
    try {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(ACCOUNT_KEY);
    } catch (e) { /* ignore */ }
  }

  function authHeaders() {
    var headers = { 'Content-Type': 'application/json' };
    var token = getToken();
    if (token) { headers.Authorization = 'Bearer ' + token; }
    return headers;
  }

  /* fetch wrapper: resolves to { status, ok, data } for any HTTP
     response (the body is parsed as JSON, {} when it is not
     JSON); rejects only on a network failure. Pass
     { auth: false } to send a request with no Authorization
     header even when a token is stored — used for the guest
     retry after a stale token is rejected. */
  function apiFetch(path, options) {
    options = options || {};
    var headers = (options.auth === false) ? { 'Content-Type': 'application/json' } : authHeaders();
    if (options.headers) {
      Object.keys(options.headers).forEach(function (k) { headers[k] = options.headers[k]; });
    }
    return fetch(API_URL + path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    }).then(function (resp) {
      return resp.json().catch(function () { return {}; }).then(function (data) {
        return { status: resp.status, ok: resp.ok, data: data };
      });
    });
  }

  function signup(name, email, password) {
    return apiFetch('/api/accounts', {
      method: 'POST',
      body: { name: name, email: email, password: password }
    }).then(function (r) {
      if (r.status === 201 && r.data.token) {
        saveSession(r.data.token, r.data.account);
        return { ok: true, account: r.data.account };
      }
      return { ok: false, status: r.status, data: r.data };
    });
  }

  function login(email, password) {
    return apiFetch('/api/auth/login', {
      method: 'POST',
      body: { email: email, password: password }
    }).then(function (r) {
      if (r.ok && r.data.token) {
        saveSession(r.data.token, r.data.account);
        return { ok: true, account: r.data.account };
      }
      return { ok: false, status: r.status, data: r.data };
    });
  }

  /* Returns the account when logged in, null otherwise. A 401
     clears the stored session (the token expired or the account
     is gone) so a stale token can never block a guest checkout. */
  function me() {
    if (!getToken()) { return Promise.resolve(null); }
    return apiFetch('/api/accounts/me', {}).then(function (r) {
      if (r.ok && r.data.account) { return r.data.account; }
      if (r.status === 401) { clearSession(); }
      return null;
    }).catch(function () { return null; });
  }

  function logout() { clearSession(); }

  window.CCEPAuth = {
    apiUrl: API_URL,
    getToken: getToken,
    getAccount: getAccount,
    clearSession: clearSession,
    apiFetch: apiFetch,
    signup: signup,
    login: login,
    me: me,
    logout: logout
  };
})();
