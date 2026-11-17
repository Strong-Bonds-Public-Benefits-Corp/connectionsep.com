/* ============================================================
   Resilience Market — live storefront + checkout
   connectionsep.com | v01 (2026-11-16)
   ------------------------------------------------------------
   Products come from GET /api/products ONLY — the catalog in
   the database is the single source of truth, and no price is
   ever hard-coded here (the old placeholder articles with
   fixed prices and PLACEHOLDER_SQUARE_LINK stubs are gone).
   Cart + shipping address + optional Resilience discount code
   + Square card form -> POST /api/orders.
   ------------------------------------------------------------
   Guest checkout is allowed (Tony, Nov 14): no account, no
   problem. A logged-in shopper's order attaches to their
   account. A STALE token is never silently treated as a
   guest — the backend answers 401 — so a 401 here clears
   the session and retries once as a guest, and says so.
   ------------------------------------------------------------
   Product options (sizes etc.) are display-only in v01: the
   orders endpoint takes { productId, quantity } and has no
   variant field, so a size choice cannot be recorded on an
   order. Options render as text ("Available in: S, M, L").
   Recording a chosen variant needs a backend change.
   ============================================================ */
(function () {
  "use strict";

  var grid = document.getElementById("product-grid");
  var statusBox = document.getElementById("market-status");
  var cartEmpty = document.getElementById("cart-empty");
  var cartLines = document.getElementById("cart-lines");
  var cartSummary = document.getElementById("cart-summary");
  var cartSubtotalEl = document.getElementById("cart-subtotal");
  var cartDiscountRow = document.getElementById("cart-discount-row");
  var cartDiscountCodeEl = document.getElementById("cart-discount-code");
  var cartDiscountAmountEl = document.getElementById("cart-discount-amount");
  var cartTotalEl = document.getElementById("cart-total");
  var checkoutForm = document.getElementById("checkout-form");
  var shipStreet = document.getElementById("ship-street");
  var shipCity = document.getElementById("ship-city");
  var shipState = document.getElementById("ship-state");
  var shipZip = document.getElementById("ship-zip");
  var zipError = document.getElementById("zip-error");
  var discountInput = document.getElementById("discount-code");
  var discountApply = document.getElementById("discount-apply");
  var discountRemove = document.getElementById("discount-remove");
  var discountStatus = document.getElementById("discount-status");
  var discountError = document.getElementById("discount-error");
  var checkoutError = document.getElementById("checkout-error");
  var placeBtn = document.getElementById("place-order");
  var orderSuccess = document.getElementById("order-success");
  var orderSuccessDetails = document.getElementById("order-success-details");
  var shopMoreBtn = document.getElementById("shop-more");
  var showLoginBtn = document.getElementById("checkout-show-login");
  var checkoutAuth = document.getElementById("checkout-auth");
  var authForm = document.getElementById("m-auth-form");
  var authError = document.getElementById("m-auth-error");
  var authSubmit = document.getElementById("m-auth-submit");
  var authNameField = document.getElementById("m-auth-name-field");
  var authName = document.getElementById("m-auth-name");
  var authEmail = document.getElementById("m-auth-email");
  var authPassword = document.getElementById("m-auth-password");
  var tabLogin = document.getElementById("m-auth-tab-login");
  var tabSignup = document.getElementById("m-auth-tab-signup");

  if (!grid || !window.CCEPAuth || !window.CCEPPayments) { return; }

  var CART_KEY = "ccep_cart";
  var products = [];          // from GET /api/products
  var byId = {};              // productId -> product
  var cart = {};              // productId -> quantity
  var discount = null;        // { code, percent, expiresAt }
  var card = null;
  var cardFailed = false;
  var authMode = "login";

  function money(cents) { return "$" + (cents / 100).toFixed(2); }
  function priceCents(p) { return Math.round(Number(p.price || 0) * 100); }
  function show(el, on) { if (el) { el.hidden = !on; } }

  /* scrollIntoView exists in every real browser; the guard
     keeps this file testable in environments without it. */
  function scrollToEl(el, block) {
    if (el && el.scrollIntoView) {
      el.scrollIntoView({ behavior: "smooth", block: block || "start" });
    }
  }

  function setStatus(text, isError) {
    if (!statusBox) { return; }
    statusBox.textContent = text;
    statusBox.hidden = !text;
    statusBox.classList.toggle("market-status-error", !!isError);
  }

  /* ---------------- Products ---------------- */

  function optionsText(p) {
    if (!Array.isArray(p.options) || p.options.length === 0) { return ""; }
    var names = p.options.map(function (o) {
      if (typeof o === "string") { return o; }
      if (o && typeof o === "object") { return o.label || o.name || o.value || ""; }
      return "";
    }).filter(function (s) { return s; });
    return names.length ? "Available in: " + names.join(", ") + "." : "";
  }

  function renderProducts() {
    grid.innerHTML = "";
    if (products.length === 0) {
      setStatus("The market is empty right now — products are being added. Check back soon.");
      return;
    }
    setStatus("");
    products.forEach(function (p) {
      var article = document.createElement("article");
      article.className = "product";
      if (p.imageUrl) {
        var img = document.createElement("img");
        img.className = "product-img";
        img.src = p.imageUrl;
        img.alt = p.name;
        article.appendChild(img);
      } else {
        var ph = document.createElement("div");
        ph.className = "product-img product-img-placeholder";
        ph.setAttribute("role", "img");
        ph.setAttribute("aria-label", p.name + " photo coming soon");
        var span = document.createElement("span");
        span.innerHTML = "Photo<br>coming soon";
        ph.appendChild(span);
        article.appendChild(ph);
      }
      var h3 = document.createElement("h3");
      h3.textContent = p.name;
      article.appendChild(h3);
      if (p.description) {
        var why = document.createElement("p");
        why.className = "product-why";
        why.textContent = p.description;
        article.appendChild(why);
      }
      var opt = optionsText(p);
      if (opt) {
        var optEl = document.createElement("p");
        optEl.className = "product-why";
        optEl.textContent = opt;
        article.appendChild(optEl);
      }
      var price = document.createElement("p");
      price.className = "product-price";
      price.textContent = money(priceCents(p));
      article.appendChild(price);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-gold";
      btn.textContent = "Add to cart";
      btn.setAttribute("data-product-id", p._id);
      btn.addEventListener("click", function () { addToCart(p._id); });
      article.appendChild(btn);
      grid.appendChild(article);
    });
  }

  function loadProducts() {
    setStatus("Loading the market…");
    return CCEPAuth.apiFetch("/api/products", {}).then(function (r) {
      if (!r.ok || !Array.isArray(r.data.products)) {
        throw new Error("products failed: " + r.status);
      }
      products = r.data.products;
      byId = {};
      products.forEach(function (p) { byId[p._id] = p; });
      /* Drop cart lines for products that are gone. */
      Object.keys(cart).forEach(function (id) { if (!byId[id]) { delete cart[id]; } });
      saveCart();
      renderProducts();
      renderCart();
    }).catch(function () {
      setStatus("The market could not load. Check your connection and refresh the page.", true);
    });
  }

  /* ---------------- Cart ---------------- */

  function loadCart() {
    try {
      var raw = window.localStorage.getItem(CART_KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      Object.keys(parsed).forEach(function (id) {
        var q = parseInt(parsed[id], 10);
        if (q >= 1 && q <= 99) { cart[id] = q; }
      });
    } catch (e) { cart = {}; }
  }

  function saveCart() {
    try { window.localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
    catch (e) { /* private mode: cart lasts for this visit only */ }
  }

  function cartItems() {
    return Object.keys(cart).map(function (id) {
      return { product: byId[id], quantity: cart[id] };
    }).filter(function (line) { return line.product; });
  }

  function cartSubtotalCents() {
    return cartItems().reduce(function (sum, line) {
      return sum + priceCents(line.product) * line.quantity;
    }, 0);
  }

  function cartDiscountCents() {
    if (!discount) { return 0; }
    return Math.round((cartSubtotalCents() * discount.percent) / 100);
  }

  function addToCart(id) {
    if (!byId[id]) { return; }
    cart[id] = Math.min(99, (cart[id] || 0) + 1);
    saveCart();
    renderCart();
    if (cartItems().length === 1 && cart[id] === 1) {
      scrollToEl(document.getElementById("cart-section"), "start");
    }
  }

  function renderCart() {
    var lines = cartItems();
    show(cartEmpty, lines.length === 0);
    show(cartLines, lines.length > 0);
    show(cartSummary, lines.length > 0);
    cartLines.innerHTML = "";
    lines.forEach(function (line) {
      var row = document.createElement("div");
      row.className = "cart-line";
      var name = document.createElement("span");
      name.className = "cart-line-name";
      name.textContent = line.product.name;
      var qty = document.createElement("span");
      qty.className = "cart-line-qty";
      var dec = document.createElement("button");
      dec.type = "button";
      dec.className = "qty-btn";
      dec.textContent = "−";
      dec.setAttribute("aria-label", "One fewer " + line.product.name);
      dec.addEventListener("click", function () {
        cart[line.product._id] -= 1;
        if (cart[line.product._id] <= 0) { delete cart[line.product._id]; }
        saveCart();
        renderCart();
      });
      var num = document.createElement("span");
      num.className = "cart-line-num";
      num.textContent = line.quantity;
      var inc = document.createElement("button");
      inc.type = "button";
      inc.className = "qty-btn";
      inc.textContent = "+";
      inc.setAttribute("aria-label", "One more " + line.product.name);
      inc.addEventListener("click", function () {
        cart[line.product._id] = Math.min(99, cart[line.product._id] + 1);
        saveCart();
        renderCart();
      });
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "link-btn";
      remove.textContent = "Remove";
      remove.addEventListener("click", function () {
        delete cart[line.product._id];
        saveCart();
        renderCart();
      });
      qty.appendChild(dec);
      qty.appendChild(num);
      qty.appendChild(inc);
      var lineTotal = document.createElement("span");
      lineTotal.className = "cart-line-total";
      lineTotal.textContent = money(priceCents(line.product) * line.quantity);
      row.appendChild(name);
      row.appendChild(qty);
      row.appendChild(lineTotal);
      row.appendChild(remove);
      cartLines.appendChild(row);
    });
    var subtotal = cartSubtotalCents();
    if (cartSubtotalEl) { cartSubtotalEl.textContent = money(subtotal); }
    var disc = cartDiscountCents();
    show(cartDiscountRow, !!discount && disc > 0);
    if (discount) {
      if (cartDiscountCodeEl) { cartDiscountCodeEl.textContent = discount.code; }
      if (cartDiscountAmountEl) { cartDiscountAmountEl.textContent = money(disc); }
    }
    if (cartTotalEl) { cartTotalEl.textContent = money(subtotal - disc); }
    refreshPlaceButton();
  }

  function refreshPlaceButton() {
    if (!placeBtn) { return; }
    var empty = cartItems().length === 0;
    placeBtn.disabled = empty || cardFailed;
    placeBtn.textContent = empty
      ? "Your cart is empty"
      : "Place order — " + money(cartSubtotalCents() - cartDiscountCents());
  }

  /* ---------------- Discount code ---------------- */

  function setDiscountMessage(text, isError) {
    show(discountStatus, !!text && !isError);
    show(discountError, !!text && isError);
    if (discountStatus) { discountStatus.textContent = isError ? "" : text; }
    if (discountError) { discountError.textContent = isError ? text : ""; }
  }

  function niceDate(iso) {
    if (!iso) { return ""; }
    return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }

  if (discountApply) {
    discountApply.addEventListener("click", function () {
      var code = (discountInput.value || "").trim();
      if (!code) {
        setDiscountMessage("Enter a discount code first.", true);
        discountInput.focus();
        return;
      }
      setDiscountMessage("");
      discountApply.disabled = true;
      discountApply.textContent = "Checking…";
      CCEPAuth.apiFetch("/api/discount-codes/validate", {
        method: "POST",
        body: { code: code }
      }).then(function (r) {
        discountApply.disabled = false;
        discountApply.textContent = "Apply";
        if (!r.ok) {
          setDiscountMessage("We couldn't check that code. Try again.", true);
          return;
        }
        if (r.data.valid) {
          discount = {
            code: code.toUpperCase(),
            percent: r.data.discountPercent,
            expiresAt: r.data.expiresAt
          };
          setDiscountMessage(discount.percent + "% off applied — code " + discount.code +
            (discount.expiresAt ? ", good through " + niceDate(discount.expiresAt) + "." : "."));
          show(discountRemove, true);
          discountInput.disabled = true;
          renderCart();
          return;
        }
        if (r.data.reason === "expired") {
          setDiscountMessage("That code has expired" +
            (r.data.expiresAt ? " (expired " + niceDate(r.data.expiresAt) + ")." : "."), true);
        } else if (r.data.reason === "already_used") {
          setDiscountMessage("That code has already been used.", true);
        } else {
          setDiscountMessage("We couldn't find that code. Check it and try again.", true);
        }
      }).catch(function () {
        discountApply.disabled = false;
        discountApply.textContent = "Apply";
        setDiscountMessage("We couldn't check that code. Check your connection and try again.", true);
      });
    });
  }

  if (discountRemove) {
    discountRemove.addEventListener("click", function () {
      discount = null;
      discountInput.value = "";
      discountInput.disabled = false;
      show(discountRemove, false);
      setDiscountMessage("");
      renderCart();
    });
  }

  /* ---------------- Checkout login (optional) ---------------- */

  function setAuthMode(mode) {
    authMode = mode;
    if (tabLogin) { tabLogin.setAttribute("aria-pressed", mode === "login" ? "true" : "false"); }
    if (tabSignup) { tabSignup.setAttribute("aria-pressed", mode === "signup" ? "true" : "false"); }
    show(authNameField, mode === "signup");
    if (authSubmit) { authSubmit.textContent = mode === "signup" ? "Create account" : "Log in"; }
    if (authError) { authError.hidden = true; }
  }

  if (tabLogin) { tabLogin.addEventListener("click", function () { setAuthMode("login"); }); }
  if (tabSignup) { tabSignup.addEventListener("click", function () { setAuthMode("signup"); }); }

  function refreshLoginNote(account) {
    /* Only the text span is ever rewritten — the Log in button
       lives in sibling spans, so updating this note can never
       destroy it. (An earlier version set textContent on the
       whole <p> and wiped the button out.) */
    var text = document.getElementById("checkout-login-text");
    var tail = document.getElementById("checkout-login-tail");
    if (account) {
      if (text) { text.textContent = "Logged in as " + account.email + " — this order will attach to your account."; }
      show(showLoginBtn, false);
      show(tail, false);
      show(checkoutAuth, false);
    } else {
      if (text) { text.textContent = "Checking out as a guest is fine."; }
      show(showLoginBtn, true);
      show(tail, true);
    }
  }

  if (showLoginBtn) {
    showLoginBtn.addEventListener("click", function () {
      show(checkoutAuth, true);
      setAuthMode("login");
      if (authEmail) { authEmail.focus(); }
    });
  }

  if (authForm) {
    authForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (authError) { authError.hidden = true; }
      var email = (authEmail.value || "").trim();
      var password = authPassword.value || "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        if (authError) { authError.textContent = "Enter a valid email address."; authError.hidden = false; }
        authEmail.focus();
        return;
      }
      if (password.length < 8) {
        if (authError) { authError.textContent = "Your password needs at least 8 characters."; authError.hidden = false; }
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
          refreshLoginNote(r.account);
          return;
        }
        if (authError) {
          if (r.status === 409) {
            authError.textContent = "An account with this email already exists — try logging in instead.";
          } else if (r.status === 401) {
            authError.textContent = "That email or password doesn't match our records.";
          } else if (r.data && r.data.details && r.data.details.length) {
            authError.textContent = r.data.details[0];
          } else {
            authError.textContent = "We couldn't reach the server. Check your connection and try again.";
          }
          authError.hidden = false;
        }
      }).catch(function () {
        authSubmit.disabled = false;
        setAuthMode(authMode);
        if (authError) {
          authError.textContent = "We couldn't reach the server. Check your connection and try again.";
          authError.hidden = false;
        }
      });
    });
  }

  /* ---------------- Card form ---------------- */

  function ensureCard() {
    if (card || cardFailed) { return; }
    var container = document.getElementById("market-card-container");
    if (!container) { cardFailed = true; refreshPlaceButton(); return; }
    CCEPPayments.createCard("market-card-container", "dark").then(function (c) {
      card = c;
      refreshPlaceButton();
    }).catch(function (err) {
      cardFailed = true;
      refreshPlaceButton();
      if (checkoutError) {
        checkoutError.textContent = err && err.message
          ? err.message
          : "The card form could not load. Check your connection and refresh the page.";
        checkoutError.hidden = false;
      }
    });
  }

  /* ---------------- Place order ---------------- */

  function validZip() {
    var v = (shipZip.value || "").trim();
    var ok = /^[0-9]{5}$/.test(v);
    if (zipError) { zipError.hidden = ok; }
    shipZip.setAttribute("aria-invalid", ok ? "false" : "true");
    return ok;
  }

  if (shipZip) {
    shipZip.addEventListener("input", function () {
      if (zipError && !zipError.hidden) { validZip(); }
    });
  }

  function orderErrorFor(r) {
    if (r.status === 402) {
      return "Your card was declined." +
        (r.data && r.data.message ? " " + r.data.message : "") +
        " Please try a different card.";
    }
    if (r.status === 503) {
      return "Card payments aren't set up yet. Please try again later — your card was not charged.";
    }
    if (r.status === 502) {
      return "The payment provider couldn't complete the charge. Please try again — your card was not charged.";
    }
    if (r.status === 400 && r.data && r.data.error === "invalid_discount_code") {
      if (r.data.reason === "already_used") {
        return "That discount code was already used. Remove it and place the order without it, or check in again for a new code.";
      }
      if (r.data.reason === "expired") {
        return "That discount code has expired. Remove it and place the order without it, or check in again for a new code.";
      }
      return "We couldn't use that discount code. Remove it and place the order without it, or check in again for a new code.";
    }
    if (r.status === 400 && r.data && r.data.details && r.data.details.length) {
      return r.data.details.join(" ");
    }
    if (r.status === 500 && r.data && r.data.squarePaymentId) {
      return "Something went wrong after your payment went through. Keep this payment reference and contact us: " + r.data.squarePaymentId;
    }
    return "Something went wrong and your card was not charged. Please try again.";
  }

  function postOrder(body, asGuest) {
    return CCEPAuth.apiFetch("/api/orders", {
      method: "POST",
      body: body,
      auth: asGuest ? false : undefined
    });
  }

  if (checkoutForm) {
    checkoutForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (checkoutError) { checkoutError.hidden = true; }
      if (cartItems().length === 0) {
        if (checkoutError) {
          checkoutError.textContent = "Your cart is empty. Add something from the market first.";
          checkoutError.hidden = false;
        }
        return;
      }
      var street = (shipStreet.value || "").trim();
      var city = (shipCity.value || "").trim();
      var state = (shipState.value || "").trim();
      if (!street || !city || !state || !validZip()) {
        if (checkoutError) {
          checkoutError.textContent = "Fill in your full shipping address — street, city, state, and a 5-digit ZIP.";
          checkoutError.hidden = false;
        }
        if (!validZip()) { shipZip.focus(); }
        return;
      }
      if (!card) {
        if (checkoutError) {
          checkoutError.textContent = "The card form is still loading. Give it a moment and try again.";
          checkoutError.hidden = false;
        }
        return;
      }
      placeBtn.disabled = true;
      placeBtn.textContent = "Processing…";
      var body = {
        items: cartItems().map(function (line) {
          return { productId: line.product._id, quantity: line.quantity };
        }),
        shippingAddress: { street: street, city: city, state: state, zip: (shipZip.value || "").trim() }
      };
      if (discount) { body.discountCode = discount.code; }

      CCEPPayments.tokenize(card).then(function (t) {
        if (!t.ok) {
          placeBtn.disabled = false;
          refreshPlaceButton();
          if (checkoutError) {
            checkoutError.textContent = t.message;
            checkoutError.hidden = false;
          }
          return;
        }
        body.sourceId = t.token;
        return postOrder(body, false).then(function (r) {
          if (r.status === 401 && CCEPAuth.getToken()) {
            /* Stale login: the backend refuses a bad token
               outright (never a silent guest order). Clear the
               session and place this same order once as a guest. */
            CCEPAuth.clearSession();
            refreshLoginNote(null);
            return postOrder(body, true).then(function (r2) {
              if (r2.status === 201) {
                return { done: true, guestRetry: true, r: r2 };
              }
              return { done: false, r: r2 };
            });
          }
          if (r.status === 201) { return { done: true, guestRetry: false, r: r }; }
          return { done: false, r: r };
        }).then(function (outcome) {
          placeBtn.disabled = false;
          refreshPlaceButton();
          if (!outcome) { return; } // tokenize failed; message already shown
          if (outcome.done) {
            var data = outcome.r.data;
            if (orderSuccessDetails) {
              orderSuccessDetails.textContent = "Order " + data.id + " — " +
                money(Math.round(Number(data.total || 0) * 100)) + ", paid." +
                (outcome.guestRetry
                  ? " Your login had expired, so this order was placed as a guest."
                  : " It will ship to " + street + ", " + city + ", " + state + " " + (shipZip.value || "").trim() + ".");
            }
            cart = {};
            discount = null;
            saveCart();
            renderCart();
            show(checkoutForm, false);
            show(orderSuccess, true);
            scrollToEl(orderSuccess, "start");
            return;
          }
          if (checkoutError) {
            checkoutError.textContent = orderErrorFor(outcome.r);
            checkoutError.hidden = false;
          }
        });
      }).catch(function () {
        placeBtn.disabled = false;
        refreshPlaceButton();
        if (checkoutError) {
          checkoutError.textContent = "We couldn't reach the server. Check your connection and try again — your card was not charged.";
          checkoutError.hidden = false;
        }
      });
    });
  }

  if (shopMoreBtn) {
    shopMoreBtn.addEventListener("click", function () {
      show(orderSuccess, false);
      show(checkoutForm, true);
      renderCart();
      scrollToEl(document.getElementById("cart-section"), "start");
    });
  }

  /* ---------------- Boot ---------------- */

  loadCart();
  renderCart();
  loadProducts();
  ensureCard();
  CCEPAuth.me().then(function (account) {
    refreshLoginNote(account);
  }).catch(function () {
    refreshLoginNote(null);
  });

})();
