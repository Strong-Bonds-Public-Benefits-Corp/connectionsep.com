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
   One card per product: the API returns one document per
   buyable size variation (25 docs for 12 products), and this
   file groups them by the imageUrl folder slug, so each
   product shows once with a size dropdown. The dropdown picks
   which variant document goes in the cart — the orders
   endpoint prices from that document, so the size, the price
   and the order line stay exact with no backend change.
   Clicking a product photo opens a gallery pop-out that steps
   through every photo of the product at its natural aspect
   ratio. If a product document has no `images` array (old
   data), the pop-out falls back to the single imageUrl.
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
  var cartTaxAmountEl = document.getElementById("cart-tax-amount");
  var cartTotalEl = document.getElementById("cart-total");
  var checkoutForm = document.getElementById("checkout-form");
  var shipStreet = document.getElementById("ship-street");
  var shipCity = document.getElementById("ship-city");
  var shipState = document.getElementById("ship-state");
  var shipZip = document.getElementById("ship-zip");
  var zipError = document.getElementById("zip-error");
  var discountInput = document.getElementById("discount-code");
  var discountRemove = document.getElementById("discount-remove");
  var discountStatus = document.getElementById("discount-status");
  var discountError = document.getElementById("discount-error");
  var missedCheckinBtn = document.getElementById("missed-checkin");
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
  /* A discount code minted by a Resilience Check In, remembered
     so the shopper's trip back to checkout (the "missed the
     check-in" button) doesn't make them retype it. The code
     itself is minted server-side by the check-in only — nothing
     on this page ever creates one. */
  var STORED_CODE_KEY = "ccep_discount_code";
  /* El Paso sales tax (Nov 17, 2026): 8.25% on the discounted
     subtotal. Mirrors the server (src/lib/codes.js TAX_RATE_PERCENT)
     exactly — same rounding — so the total the shopper sees is the
     total the server charges. Display-only: the server stays the
     source of truth. */
  var TAX_RATE_PERCENT = 8.25;
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

  /* ---------------- Product grouping ----------------
     The API returns one document per buyable size variation.
     Group by the imageUrl folder slug — every doc carries
     assets/products/<slug>/... — so each product renders
     once. Variants keep the API's order (the store's own
     size order: S, M, L, XL, 2XL, ...). */
  function groupKey(p) {
    var m = /assets\/products\/([^\/]+)\//.exec(p.imageUrl || "");
    return m ? m[1] : ("id:" + p._id);
  }

  function splitName(name) {
    var i = (name || "").lastIndexOf(" — ");
    if (i < 0) { return { base: name, size: "" }; }
    return { base: name.slice(0, i), size: name.slice(i + 3) };
  }

  function groupProducts(list) {
    var groups = [];
    var byKey = {};
    list.forEach(function (p) {
      var key = groupKey(p);
      var g = byKey[key];
      if (!g) {
        g = {
          key: key,
          name: splitName(p.name).base,
          description: p.description,
          imageUrl: p.imageUrl,
          /* Every photo of the item (seed order, card photo
             first); null when the document predates `images`. */
          images: (Array.isArray(p.images) && p.images.length) ? p.images.slice() : null,
          variants: []
        };
        byKey[key] = g;
        groups.push(g);
      }
      g.variants.push({ product: p, size: splitName(p.name).size || p.name });
      if (!g.images && Array.isArray(p.images) && p.images.length) { g.images = p.images.slice(); }
      if (!g.imageUrl && p.imageUrl) { g.imageUrl = p.imageUrl; }
      if (!g.description && p.description) { g.description = p.description; }
    });
    return groups;
  }

  /* ---------------- Gallery pop-out (photo lightbox) ----------------
     Steps through every photo of the product, from the group's
     `images` array (seed order, card photo first). Falls back
     to the single imageUrl when a product document has no
     `images` array (old data) — the page never breaks. One
     photo on the card; no thumbnail strip. Created in JS so
     market.html needs no new markup. */
  var lightboxEl = null;
  var lightboxImages = [];
  var lightboxIndex = 0;
  var lightboxImgEl = null;
  var lightboxCounterEl = null;

  function showLightboxImage() {
    if (!lightboxImgEl || lightboxImages.length === 0) { return; }
    lightboxImgEl.src = lightboxImages[lightboxIndex];
    if (lightboxCounterEl) {
      lightboxCounterEl.textContent = (lightboxIndex + 1) + " / " + lightboxImages.length;
    }
  }

  function stepLightbox(delta) {
    if (lightboxImages.length < 2) { return; }
    lightboxIndex = (lightboxIndex + delta + lightboxImages.length) % lightboxImages.length;
    showLightboxImage();
  }

  function openLightbox(images, startIndex, alt) {
    closeLightbox();
    var list = (Array.isArray(images) && images.length) ? images.slice() : [];
    if (list.length === 0) { return; }
    lightboxImages = list;
    lightboxIndex = Math.min(Math.max(startIndex || 0, 0), list.length - 1);
    var overlay = document.createElement("div");
    overlay.className = "lightbox";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", (alt || "Product photos") + " — enlarged");
    var img = document.createElement("img");
    img.className = "lightbox-img";
    img.alt = alt || "";
    lightboxImgEl = img;
    var prev = null;
    var next = null;
    var counter = null;
    if (list.length > 1) {
      prev = document.createElement("button");
      prev.type = "button";
      prev.className = "lightbox-nav lightbox-prev";
      prev.setAttribute("aria-label", "Previous photo");
      prev.textContent = "‹";
      prev.addEventListener("click", function (ev) { ev.stopPropagation(); stepLightbox(-1); });
      next = document.createElement("button");
      next.type = "button";
      next.className = "lightbox-nav lightbox-next";
      next.setAttribute("aria-label", "Next photo");
      next.textContent = "›";
      next.addEventListener("click", function (ev) { ev.stopPropagation(); stepLightbox(1); });
      counter = document.createElement("span");
      counter.className = "lightbox-counter";
      lightboxCounterEl = counter;
    } else {
      lightboxCounterEl = null;
    }
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lightbox-close";
    btn.setAttribute("aria-label", "Close enlarged photos");
    btn.textContent = "×";
    btn.addEventListener("click", function () { closeLightbox(); });
    overlay.addEventListener("click", function (ev) {
      if (ev.target === overlay) { closeLightbox(); }
    });
    overlay.appendChild(img);
    if (prev) { overlay.appendChild(prev); }
    if (next) { overlay.appendChild(next); }
    if (counter) { overlay.appendChild(counter); }
    overlay.appendChild(btn);
    document.body.appendChild(overlay);
    lightboxEl = overlay;
    showLightboxImage();
    if (btn.focus) { btn.focus(); }
  }

  function closeLightbox() {
    if (lightboxEl && lightboxEl.parentNode) { lightboxEl.parentNode.removeChild(lightboxEl); }
    lightboxEl = null;
    lightboxImages = [];
    lightboxIndex = 0;
    lightboxImgEl = null;
    lightboxCounterEl = null;
  }

  document.addEventListener("keydown", function (ev) {
    if (!lightboxEl) { return; }
    if (ev.key === "Escape") { closeLightbox(); }
    else if (ev.key === "ArrowLeft") { stepLightbox(-1); }
    else if (ev.key === "ArrowRight") { stepLightbox(1); }
  });

  function renderProducts() {
    grid.innerHTML = "";
    var groups = groupProducts(products);
    if (groups.length === 0) {
      setStatus("The market is empty right now — products are being added. Check back soon.");
      return;
    }
    setStatus("");
    groups.forEach(function (g) {
      var article = document.createElement("article");
      article.className = "product";
      if (g.imageUrl) {
        var img = document.createElement("img");
        img.className = "product-img";
        img.src = g.imageUrl;
        img.alt = g.name;
        img.tabIndex = 0;
        img.setAttribute("role", "button");
        img.setAttribute("aria-label", "View photos of " + g.name);
        var galleryImages = g.images || (g.imageUrl ? [g.imageUrl] : []);
        img.addEventListener("click", function () { openLightbox(galleryImages, 0, g.name); });
        img.addEventListener("keydown", function (ev) {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            openLightbox(galleryImages, 0, g.name);
          }
        });
        article.appendChild(img);
      } else {
        var ph = document.createElement("div");
        ph.className = "product-img product-img-placeholder";
        ph.setAttribute("role", "img");
        ph.setAttribute("aria-label", g.name + " photo coming soon");
        var span = document.createElement("span");
        span.innerHTML = "Photo<br>coming soon";
        ph.appendChild(span);
        article.appendChild(ph);
      }
      var h3 = document.createElement("h3");
      h3.textContent = g.name;
      article.appendChild(h3);
      if (g.description) {
        var why = document.createElement("p");
        why.className = "product-why";
        why.textContent = g.description;
        article.appendChild(why);
      }
      var opt = optionsText(g.variants[0].product);
      if (opt) {
        var optEl = document.createElement("p");
        optEl.className = "product-why";
        optEl.textContent = opt;
        article.appendChild(optEl);
      }
      var price = document.createElement("p");
      price.className = "product-price";
      price.textContent = money(priceCents(g.variants[0].product));
      article.appendChild(price);
      var select = null;
      if (g.variants.length > 1) {
        var field = document.createElement("div");
        field.className = "field";
        var label = document.createElement("label");
        label.textContent = "Size";
        label.setAttribute("for", "size-" + g.key);
        field.appendChild(label);
        select = document.createElement("select");
        select.id = "size-" + g.key;
        select.setAttribute("aria-label", "Size for " + g.name);
        g.variants.forEach(function (v) {
          var o = document.createElement("option");
          o.value = v.product._id;
          o.textContent = v.size + " — " + money(priceCents(v.product));
          select.appendChild(o);
        });
        select.addEventListener("change", function () {
          var chosen = byId[select.value];
          if (chosen) { price.textContent = money(priceCents(chosen)); }
        });
        field.appendChild(select);
        /* Size picker sits above the price so the price that
           follows it is always the picked size's price. */
        article.insertBefore(field, price);
      }
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-gold";
      btn.textContent = "Add to cart";
      btn.setAttribute("data-product-id", g.variants[0].product._id);
      btn.addEventListener("click", function () {
        /* The selected variant's own document id — the orders
           endpoint prices from that document, so the size and
           the charge stay exact. */
        addToCart(select ? select.value : g.variants[0].product._id);
      });
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

  function cartTaxCents() {
    return Math.round(((cartSubtotalCents() - cartDiscountCents()) * TAX_RATE_PERCENT) / 100);
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
    var tax = cartTaxCents();
    if (cartTaxAmountEl) { cartTaxAmountEl.textContent = money(tax); }
    if (cartTotalEl) { cartTotalEl.textContent = money(subtotal - disc + tax); }
    refreshPlaceButton();
  }

  function refreshPlaceButton() {
    if (!placeBtn) { return; }
    var empty = cartItems().length === 0;
    placeBtn.disabled = empty || cardFailed;
    placeBtn.textContent = empty
      ? "Your cart is empty"
      : "Place order — " + money(cartSubtotalCents() - cartDiscountCents() + cartTaxCents());
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

  /* ---------------- Stored check-in code ----------------
     The "missed the check-in" button sends the shopper to the
     check-in page and back; the code they earned is remembered
     here so the discount field is pre-filled on their return
     and auto-applied (see autoValidateDiscount). An expired
     code is dropped, not pre-filled. */
  function readStoredDiscountCode() {
    try {
      var raw = window.localStorage.getItem(STORED_CODE_KEY);
      if (!raw) { return null; }
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.code !== "string" || !parsed.code.trim()) { return null; }
      if (parsed.expiresAt) {
        var exp = Date.parse(parsed.expiresAt);
        if (!isNaN(exp) && exp < Date.now()) {
          try { window.localStorage.removeItem(STORED_CODE_KEY); } catch (e) {}
          return null;
        }
      }
      return parsed;
    } catch (e) { return null; }
  }

  function clearStoredDiscountCode() {
    try { window.localStorage.removeItem(STORED_CODE_KEY); } catch (e) {}
  }

  function refreshMissedCheckin() {
    /* The button is a shortcut TO the check-in, never around
       it: once a discount is applied there is nothing left
       to fetch, so it hides until the code is removed. */
    show(missedCheckinBtn, !discount);
  }

  /* Auto-apply: there is no Apply button. Whenever the box
     holds a code — typed, pasted, or pre-filled from the
     check-in — the server validates it and the discount shows
     in the total. A code in the box is a code the shopper
     wants used; saving it for later means clearing the box.
     Validation is read-only (the order consumes the code),
     so re-checking is safe. A slow or failed check never
     silently charges full price: the submit gate below waits
     for the check, or stops the order. */
  var discountCheckSeq = 0;   // guards against stale responses
  var discountCheckPending = null; // in-flight validation promise

  function autoValidateDiscount() {
    var seq = ++discountCheckSeq;
    var code = (discountInput.value || "").trim().toUpperCase();
    if (!code) {
      discount = null;
      discountCheckPending = null;
      setDiscountMessage("");
      show(discountRemove, false);
      renderCart();
      refreshMissedCheckin();
      return Promise.resolve();
    }
    if (discount && discount.code === code) {
      return Promise.resolve();
    }
    setDiscountMessage("Checking your code…", false);
    discountCheckPending = CCEPAuth.apiFetch("/api/discount-codes/validate", {
      method: "POST",
      body: { code: code }
    }).then(function (r) {
      if (seq !== discountCheckSeq) { return; } // superseded
      if ((discountInput.value || "").trim().toUpperCase() !== code) { return; } // box changed
      if (!r.ok) {
        discount = null;
        setDiscountMessage("We couldn't check that code. Try again.", true);
        show(discountRemove, false);
        renderCart();
        refreshMissedCheckin();
        return;
      }
      if (r.data.valid) {
        discount = {
          code: code,
          percent: r.data.discountPercent,
          expiresAt: r.data.expiresAt
        };
        setDiscountMessage(discount.percent + "% off applied — code " + discount.code +
          (discount.expiresAt ? ", good through " + niceDate(discount.expiresAt) + "." : "."));
        show(discountRemove, true);
        renderCart();
        refreshMissedCheckin();
        return;
      }
      discount = null;
      if (r.data.reason === "expired") {
        setDiscountMessage("That code has expired" +
          (r.data.expiresAt ? " (expired " + niceDate(r.data.expiresAt) + ")." : "."), true);
      } else if (r.data.reason === "already_used") {
        setDiscountMessage("That code has already been used.", true);
      } else {
        setDiscountMessage("We couldn't find that code. Check it and try again.", true);
      }
      show(discountRemove, false);
      renderCart();
      refreshMissedCheckin();
    }).catch(function () {
      if (seq !== discountCheckSeq) { return; }
      if ((discountInput.value || "").trim().toUpperCase() !== code) { return; }
      discount = null;
      setDiscountMessage("We couldn't check that code. Check your connection and try again.", true);
      show(discountRemove, false);
      renderCart();
      refreshMissedCheckin();
    }).then(function () {
      if (seq === discountCheckSeq) { discountCheckPending = null; }
    });
    return discountCheckPending;
  }

  var discountDebounce = null;
  if (discountInput) {
    discountInput.addEventListener("input", function () {
      if (discountDebounce) { clearTimeout(discountDebounce); }
      discountDebounce = setTimeout(function () { autoValidateDiscount(); }, 500);
    });
    discountInput.addEventListener("blur", function () {
      if (discountDebounce) { clearTimeout(discountDebounce); discountDebounce = null; }
      autoValidateDiscount();
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
      refreshMissedCheckin();
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
      var codeTyped = (discountInput.value || "").trim();
      if (codeTyped && !discount) {
        /* A code sits in the box but is not applied yet —
           validation still running, or it failed. Never
           silently charge full price: check it now, and only
           place the order once the discount is settled. */
        placeBtn.disabled = true;
        placeBtn.textContent = "Checking code…";
        autoValidateDiscount().then(function () {
          if (!discount) {
            placeBtn.disabled = false;
            refreshPlaceButton();
            if (checkoutError) {
              checkoutError.textContent = "That discount code didn't check out — fix it, or remove it to pay full price.";
              checkoutError.hidden = false;
            }
            return;
          }
          proceed();
        });
        return;
      }
      proceed();

      function proceed() {
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
            /* A discount code is consumed by the order — the
               remembered copy is now dead, so drop it rather
               than pre-filling a used code on the next visit. */
            var hadDiscount = !!discount;
            cart = {};
            discount = null;
            if (hadDiscount) { clearStoredDiscountCode(); }
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
      }
    });
  }

  if (shopMoreBtn) {
    shopMoreBtn.addEventListener("click", function () {
      show(orderSuccess, false);
      show(checkoutForm, true);
      renderCart();
      refreshMissedCheckin();
      scrollToEl(document.getElementById("cart-section"), "start");
    });
  }

  /* ---------------- Boot ---------------- */

  /* Returning from the check-in (the "missed the check-in"
     button): pre-fill the code they earned, then validate it
     right away so the discount shows in the total without
     any extra tap. */
  var storedCode = readStoredDiscountCode();
  if (storedCode && discountInput && !discountInput.value) {
    discountInput.value = storedCode.code;
  }
  if (discountInput && discountInput.value) {
    autoValidateDiscount();
  }
  refreshMissedCheckin();

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
