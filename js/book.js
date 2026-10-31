/* Survivor Journal: Your Story — live page. Standalone file (not main.js).
   LIVE: story submissions disabled until the backend lands. The Vault contract is documented
   in the comments so the backend build wires straight in. */

(function () {
  "use strict";

  /* ---------- Tag display map ----------
     Legacy Vault data stores abbreviated tags. The Book NEVER shows abbreviations
     (Tony's standing rule: spell out Domestic Violence and Sexual Assault).
     Full-word tags pass through unchanged. */
  var TAG_DISPLAY = {
    "DV": "Domestic Violence",
    "SUI": "Suicide",
    "MH": "Mental Health",
    "PTSD": "PTSD",
    "MST": "Military Sexual Trauma",
    "SA": "Sexual Assault"
  };
  function displayTag(tag) { return TAG_DISPLAY[tag] || tag; }

  /* ---------- Hard-coded opening chapters ----------
     Pages 1–3 are hard-coded on purpose: the Book always opens, even if the
     Vault cannot be reached. Page 1: Tony, named. Page 2: Marylou, FIRST PERSON (Book voice rule, Tony Oct 30: chapters speak as 'I', unlike Our Story's third person) — NAMING
     PENDING HER VERIFICATION (Tony, Oct 30: name her because the chapter names
     Sarah, so anonymity would be fiction; do not treat as approved until she
     confirms). Page 3: labeled sample, unchanged. */
  var PAGES = [
    {
      kicker: "Chapter 1",
      title: "Tony Sorensen",
      byline: "Co-Founder · 20-year U.S. Army SSG",
      paragraphs: [
        "In November 2023, I attempted to end my life.",
        "Twenty years in the Army. Three deployments to Afghanistan, tours in Bahrain and Qatar, a year in USARAF. It wasn't combat that nearly killed me. It was Fort Bliss — the institution I gave everything to.",
        "Before that night, I'd written it all down — everything the Army was getting wrong. A \u201CWords to Live By\u201D note, meant to spotlight the problems. I sent it up the entire chain — the Secretary of the Army, the Sergeant Major of the Army, the Secretary of Defense, the FORSCOM commanding general and his senior enlisted advisor.",
        "I survived the night. In intensive outpatient therapy afterward, I met Marylou. I told her about the coffee shop I'd been dreaming about. She said seven words that changed everything: \u201CWhy not tie it to mental health?\u201D",
        "That was her idea. Not mine. I asked her to build it with me — because the thing that made it matter, the thing that made it a mission instead of a shop, came from her.",
        "Coffee & Connections exists because in November 2023, I needed a place like this. And there wasn't one."
      ],
      tags: ["Suicide", "Isolation"]
    },
    {
      kicker: "Chapter 2",
      title: "Marylou Culpepper",
      byline: "Co-Founder · U.S. Army Veteran, MST Survivor, Sarah's mom",
      paragraphs: [
        "The system that was supposed to protect me is the one I had to survive. I'm an MST survivor, an Army veteran, and Sarah's mom — Sarah's Place carries her name. I lived the injustice. Now I'm building what should have been there when I needed it.",
        "I joined the Army to serve. Instead I learned what it feels like when the institution built to protect you protects itself.",
        "I am a survivor of Military Sexual Trauma. And the assault wasn't the only wound — it was what came after. How the Army treated me. How it turned its back. I left the Army carrying PTSD and a VA rating because of what was done to me, and because of how the system answered.",
        "I served in Signals Intelligence — where precision is everything — and I brought that same precision to designing the \u201CSurvivor-First\u201D standards that run this entire operation. I know exactly what a system that fails survivors looks like. I lived inside one.",
        "I'm Sarah's mom. Sarah's Place, our transitional housing for domestic violence survivors, carries my daughter's name — because I am building the world I want Sarah to grow up in. One where survivors are believed. Where there's a place to land."
      ],
      tags: ["Military Sexual Trauma", "Sexual Assault", "PTSD"]
    },
    {
      kicker: "Chapter 3",
      title: "Sample entry",
      byline: "Sample layout — not a real person's story",
      paragraphs: [
        "This is what a community story looks like when it arrives from the Vault. A few sentences or a few paragraphs, in the writer's own words, tagged so readers can find the pain they share.",
        "Real entries replace this page. Nothing here is a real person's story — this page exists only to show the layout, the tags, and the way a page turns."
      ],
      tags: ["Domestic Violence", "PTSD", "Sexual Assault"],
      sample: true
    }
  ];

  /* ---------- Vault stories (Chapter 4 and beyond) ----------
     REMOVED Oct 30 (Tony): the founders' short Vault entries (Anthony, Marylou)
     are not rendered here — the longer opening chapters tell the whole story
     and nobody appears twice. The short documents were also DELETED from the
     Vault on Oct 30 (cleanup: Jas J only remains); their texts are preserved
     in the build notes, not in the database.
     In production, approved Vault docs render here after Chapter 3, using the
     tag display map above for legacy abbreviations. */

  /* ---------- Vault contract (backend phase — NOT wired on this page yet) ----------
     Submit:  POST /stories  { alias | "Anonymous", message, tags[],
                                consentGiven: true, consentAt: now,
                                consentTextVersion: "20261030-hybrid" }
              -> server sets isApproved=false, submittedAt=now. A founder reviews
                 before it can appear (see Review below).
              -> server REJECTS any submission without consentGiven=true:
                 no checkbox, no publication. Consent is stored WITH the story,
                 not in a side note — every published story must trace to a
                 checked box (or, for Jas J only, to the attested permission
                 recorded in the handoff).
     Alert:    on EVERY submission — whether or not the author left an email —
               the backend sends a CONTENT-FREE alert to the reviewers
               (founders; exact review inbox to be set at backend build).
               The alert carries alias, tags, submittedAt, and a link to the
               review queue. It NEVER carries the story text or the author's
               email — the story lives in ONE place (the Vault), and the
               alert is only the doorbell. Sending uses the existing Google
               Workspace mail; no new vendor.
     Review:   a founder reads every pending story in an authenticated review
               queue (GET /stories?approved=false, reviewer-only). Approve is
               one click: POST /stories/:id/approve flips isApproved=true and
               the story joins the approved feed. Reject keeps it out of the
               feed. No database hand-editing, no Atlas console for reviews.
               NO AUTO-APPROVE, ever: a timer must never publish an unreviewed
               story by default — review is human, every time.
     Reminder clock (proposed): a story unreviewed after 7 days re-pings the
               reviewers ("N stories waiting"); after 14 days it escalates to
               both founders. The clock nags humans; it never publishes.
     Author email (optional): if the author left one, it goes to a SEPARATE
               store — never into the stories collection, never published —
               and is used ONLY to contact the author (receipt note, publish
               notice, removal handling).
     Retrieve: GET /stories?approved=true
              -> [{ alias, message, tags, submittedAt }] — approved only, newest last.
                 The page appends these after the hard-coded chapters.
     Failure:  if the Vault cannot be reached, the Book still opens with its
                 hard-coded chapters. It never opens empty.
     Removal:  an author can ask for removal at any time; the document is withdrawn. */

  var FORM_TAGS = [
    "Domestic Violence", "Sexual Assault", "Military Sexual Trauma", "PTSD",
    "Depression", "Anxiety", "Grief", "Suicide", "Suicide Loss", "Isolation"
  ];

  /* ---------- Book rendering ---------- */
  var bookEl = document.getElementById("book");
  var kickerEl = document.getElementById("page-kicker");
  var titleEl = document.getElementById("page-title");
  var bylineEl = document.getElementById("page-byline");
  var bodyEl = document.getElementById("page-body");
  var tagsEl = document.getElementById("page-tags");
  var counterEl = document.getElementById("page-counter");
  var prevBtn = document.getElementById("btn-prev");
  var nextBtn = document.getElementById("btn-next");
  var chapterListEl = document.getElementById("chapter-list");
  var current = 0;

  function tagChip(tag, sample) {
    var span = document.createElement("span");
    span.className = sample ? "tag tag-sample" : "tag";
    span.textContent = tag;
    return span;
  }

  function render(index) {
    var page = PAGES[index];
    kickerEl.textContent = page.kicker;
    titleEl.textContent = page.title;
    bylineEl.textContent = page.byline;
    bodyEl.innerHTML = "";
    page.paragraphs.forEach(function (text) {
      var p = document.createElement("p");
      p.textContent = text;
      bodyEl.appendChild(p);
    });
    tagsEl.innerHTML = "";
    page.tags.forEach(function (tag) {
      tagsEl.appendChild(tagChip(tag, !!page.sample));
    });
    counterEl.textContent = "Page " + (index + 1) + " of " + PAGES.length;
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === PAGES.length - 1;
    var buttons = chapterListEl.querySelectorAll(".chapter-btn");
    buttons.forEach(function (btn, i) {
      if (i === index) { btn.setAttribute("aria-current", "true"); }
      else { btn.removeAttribute("aria-current"); }
    });
  }

  function turnTo(index) {
    if (index < 0 || index >= PAGES.length || index === current) { return; }
    bookEl.classList.add("turning");
    window.setTimeout(function () {
      current = index;
      render(current);
      bookEl.classList.remove("turning");
    }, 350);
  }

  PAGES.forEach(function (page, i) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chapter-btn";
    btn.textContent = (i + 1) + ". " + page.title;
    btn.addEventListener("click", function () { turnTo(i); });
    chapterListEl.appendChild(btn);
  });

  prevBtn.addEventListener("click", function () { turnTo(current - 1); });
  nextBtn.addEventListener("click", function () { turnTo(current + 1); });
  document.addEventListener("keydown", function (event) {
    if (event.key === "ArrowLeft") { turnTo(current - 1); }
    if (event.key === "ArrowRight") { turnTo(current + 1); }
  });

  /* ---------- Form ---------- */
  var tagGrid = document.getElementById("tag-grid");
  FORM_TAGS.forEach(function (tag) {
    var label = document.createElement("label");
    var box = document.createElement("input");
    box.type = "checkbox";
    box.name = "tags";
    box.value = tag;
    label.appendChild(box);
    label.appendChild(document.createTextNode(" " + tag));
    tagGrid.appendChild(label);
  });

  var aliasInput = document.getElementById("alias-input");
  document.querySelectorAll('input[name="display"]').forEach(function (radio) {
    radio.addEventListener("change", function () {
      aliasInput.disabled = document.querySelector('input[name="display"]:checked').value !== "alias";
      if (!aliasInput.disabled) { aliasInput.focus(); }
    });
  });

  document.getElementById("story-form").addEventListener("submit", function (event) {
    event.preventDefault();
    var message = document.getElementById("message-input").value.trim();
    var consent = document.getElementById("consent-input").checked;
    var status = document.getElementById("form-status");
    if (!message) { status.textContent = "Please write your story first — even one sentence is enough."; return; }
    if (!consent) { status.textContent = "Please check the consent box before sending."; return; }
    /* LIVE: submissions disabled until the backend lands. Then: POST /stories (see contract above). */
    status.textContent = "Story submissions aren't open yet. When they open, your story will go to the Vault for review before appearing in the Journal.";
  });

  render(current);
})();
