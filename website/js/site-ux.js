/**
 * Shared UX: header phone, footer tel link, FAQ accordion activation, testimonials placeholder.
 */
(function () {
  "use strict";

  var PHONE_DISPLAY = "800.966.9329";
  var PHONE_TEL = "tel:+18009669329";

  function injectHeaderPhone() {
    if (document.querySelector(".tp-header-phone")) return;
    var quote = document.querySelector(
      'nav .bar__module a.btn[href="/contact/"], nav .bar__module a.btn[href*="/contact"]'
    );
    if (!quote || !quote.parentElement) return;
    var a = document.createElement("a");
    a.className = "tp-header-phone tp-header-phone--desktop";
    a.href = PHONE_TEL;
    a.setAttribute("aria-label", "Call Tickerplay sales at 800-966-9329");
    a.innerHTML = '<i class="fa fa-phone" aria-hidden="true"></i> ' + PHONE_DISPLAY;
    quote.parentElement.insertBefore(a, quote);
  }

  function linkifyFooterPhone() {
    var footer = document.querySelector("footer");
    if (!footer) return;
    footer.querySelectorAll("li").forEach(function (li) {
      var text = (li.textContent || "").trim();
      if (/800\.966\.9329/.test(text) && !li.querySelector("a")) {
        li.innerHTML =
          '<a class="tp-footer-phone" href="' +
          PHONE_TEL +
          '">' +
          text.replace("800.966.9329", "800.966.9329") +
          "</a>";
      }
    });
  }

  function initFaqAccordion() {
    document.querySelectorAll(".tp-faq").forEach(function (root) {
      root.querySelectorAll(".tp-faq-item").forEach(function (item) {
        var btn = item.querySelector(".tp-faq-button");
        var panel = item.querySelector(".tp-faq-panel");
        if (!btn || !panel) return;
        var id = panel.id || "tp-faq-panel-" + Math.random().toString(36).slice(2, 8);
        panel.id = id;
        btn.setAttribute("aria-controls", id);
        btn.setAttribute("aria-expanded", "false");
        btn.addEventListener("click", function () {
          var open = item.classList.toggle("is-open");
          btn.setAttribute("aria-expanded", open ? "true" : "false");
          var icon = btn.querySelector(".tp-faq-icon");
          if (icon) icon.textContent = open ? "−" : "+";
        });
      });
    });
  }

  function ensureTestimonialsPlaceholder() {
    if (document.querySelector(".tp-testimonials-placeholder")) return;
    // Homepage only — after Our Clients section
    if (!document.body || window.location.pathname.replace(/\/+$/, "") !== "") return;
    var clients = null;
    document.querySelectorAll("h2").forEach(function (h) {
      if (/Our Clients/i.test(h.textContent || "")) clients = h.closest("section");
    });
    if (!clients) return;
    var block = document.createElement("section");
    block.className = "container tp-testimonials-placeholder";
    block.setAttribute("aria-label", "Client testimonials placeholder");
    block.innerHTML =
      "<h2>What Our Clients Say</h2>" +
      "<p><strong>[Placeholder — needs real quotes]</strong> Add verified client testimonials " +
      "(name, title, organization, optional photo) before this section goes live. " +
      "Do not publish fabricated quotes.</p>";
    clients.parentNode.insertBefore(block, clients.nextSibling);
  }

  function init() {
    injectHeaderPhone();
    linkifyFooterPhone();
    initFaqAccordion();
    ensureTestimonialsPlaceholder();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
