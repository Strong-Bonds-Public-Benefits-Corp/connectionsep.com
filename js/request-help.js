/* Request Help — shared component (Survivor Journal + review queue page).
   A fixed "Request Help" button opens a small panel with 988 and RAINN.
   No dependencies. Looks for #request-help-btn, #request-help-panel and
   #request-help-close on the page; does nothing if they are absent.
   Keyboard-accessible: Escape closes, focus returns to the button.
*/
(function () {
  'use strict';

  function init() {
    var btn = document.getElementById('request-help-btn');
    var panel = document.getElementById('request-help-panel');
    var closeBtn = document.getElementById('request-help-close');
    if (!btn || !panel || !closeBtn) return;

    var lastFocus = null;

    function open() {
      lastFocus = document.activeElement;
      panel.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      closeBtn.focus();
    }

    function close() {
      panel.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      if (lastFocus && lastFocus.focus) lastFocus.focus();
      else btn.focus();
    }

    btn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);

    // Clicking the dimmed backdrop (outside the card) closes the panel.
    panel.addEventListener('click', function (e) {
      if (e.target === panel) close();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hidden) close();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
