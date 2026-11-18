/* Survivor Journal: Your Story — live page. Standalone file (not main.js).
   The book renders the three hard-coded founder chapters, then approved
   Vault stories (Chapter 4+) appended by js/journal.js. The submission
   form and the Vault feed wiring live in js/journal.js. */

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

  /* ---------- Vault contract (LIVE — see js/journal.js for the wiring) ----------
     Submit:  POST /api/stories  { displayType: "first_name" | "alias" | "anonymous",
                                firstName?, city?, alias?, message (max 10,000 chars),
                                tags[] (from the allowed full-word list only),
                                email? (optional), consentGiven: true }
              -> 201 { storyId, status: "pending", reviewBy: submittedAt + 24h }.
                 The story lands pending / invisible. The response NEVER echoes
                 the story text back. A 400 carries a plain reason; nothing is stored.
              -> the server REJECTS any submission without consentGiven=true:
                 no checkbox, no publication. Consent is stored WITH the story.
     Alert:    on EVERY submission the backend sends a CONTENT-FREE alert to the
               reviewers. It NEVER carries the story text or the author's email.
     Review:   a reviewer reads every pending story in the authenticated review
               queue (GET /api/review/stories?status=pending). Approve is one click:
               POST /api/review/stories/:id/approve sets status "approved" and the
               story joins the approved feed. Reject keeps it out of the feed.
               NO AUTO-APPROVE, ever — review is human, every time.
     Review clock: a story untouched after 12 hours nudges the reviewers; after
               24 hours it escalates to Tony. The clock nags humans; it never publishes.
     Author email (optional): if the author left one, it goes to a SEPARATE
               store (story_contacts) — never into the stories collection, never
               published — and is used ONLY to contact the author.
     Retrieve: GET /api/stories/approved
              -> { stories: [{ id, displayType, displayName, city, alias, message,
                               tags, approvedAt }], nextAfter } — approved only,
                 approvedAt ascending, 20 per page, ?after= cursor. The page
                 appends these after the hard-coded chapters (Chapter 4+).
                 There is NO public GET /api/stories/:id — an unapproved story
                 cannot be reached by guessing an address.
     Failure:  if the Vault cannot be reached, the Book still opens with its
                 hard-coded chapters. It never opens empty.
     Removal:  an author can ask for removal at any time (POST
               /api/stories/:id/request-removal with a removal token). The story
               is hidden immediately; deletion happens only on author confirmation
               (POST .../confirm-removal); restore puts it back
               (POST .../restore-removal). Removal pages live at
               /journal/remove/request|confirm|restore. */

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

  function buildChapterList() {
    chapterListEl.innerHTML = "";
    PAGES.forEach(function (page, i) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chapter-btn";
      btn.textContent = (i + 1) + ". " + page.title;
      btn.addEventListener("click", function () { turnTo(i); });
      chapterListEl.appendChild(btn);
    });
  }

  /* Append approved Vault stories as new book pages (Chapter 4+).
     Called by js/journal.js after it fetches the approved feed.
     Rebuilds the chapter list so the new chapters are reachable, and
     refreshes the page counter. Returns how many pages were added. */
  window.appendJournalPages = function (pages) {
    if (!Array.isArray(pages) || pages.length === 0) { return 0; }
    pages.forEach(function (page) {
      var n = PAGES.length + 1;
      PAGES.push({
        kicker: "Chapter " + n,
        title: page.title,
        byline: page.byline || "",
        paragraphs: page.paragraphs,
        tags: page.tags || [],
      });
    });
    buildChapterList();
    render(current);
    return pages.length;
  };

  buildChapterList();

  prevBtn.addEventListener("click", function () { turnTo(current - 1); });
  nextBtn.addEventListener("click", function () { turnTo(current + 1); });
  document.addEventListener("keydown", function (event) {
    if (event.key === "ArrowLeft") { turnTo(current - 1); }
    if (event.key === "ArrowRight") { turnTo(current + 1); }
  });

  /* ---------- Form tags ---------- */
  /* The tag checkboxes are built here; the form itself (display choice,
     validation, submit, and the under-construction gate) lives in
     js/journal.js. Tags come from the allowed full-word list only — the
     Vault rejects anything outside it. */
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

  render(current);
})();
