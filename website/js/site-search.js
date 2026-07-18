/**
 * Tickerplay site search — Fuse.js over /search-index.json (lazy-loaded).
 */
(function () {
  "use strict";

  var FUSE_SRC = "/js/fuse.min.js";
  var INDEX_SRC = "/search-index.json";
  var DEBOUNCE_MS = 180;
  var TYPE_ORDER = ["Products", "Industries", "Blog", "Pages"];
  var FALLBACK_LINKS = [
    { href: "/led-ticker-tape/", label: "LED Ticker Tapes" },
    { href: "/led-stock-ticker/", label: "Stock Tickers" },
    { href: "/sports-bars/", label: "Sports Bars" },
    { href: "/university-finance-lab/", label: "University Finance Labs" },
    { href: "/contact/", label: "Contact / Get Quote" },
  ];

  var state = {
    open: false,
    ready: false,
    loading: false,
    fuse: null,
    pages: [],
    active: -1,
    results: [],
    lastFocused: null,
  };

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.Fuse) {
        resolve();
        return;
      }
      var s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = function () {
        resolve();
      };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function ensureAssets() {
    if (state.ready) return Promise.resolve();
    if (state.loading) {
      return state.loading;
    }
    state.loading = Promise.all([
      loadScript(FUSE_SRC),
      fetch(INDEX_SRC, { credentials: "same-origin" }).then(function (r) {
        if (!r.ok) throw new Error("search index " + r.status);
        return r.json();
      }),
    ]).then(function (parts) {
      state.pages = (parts[1] && parts[1].pages) || [];
      state.fuse = new window.Fuse(state.pages, {
        includeScore: true,
        threshold: 0.38,
        ignoreLocation: true,
        minMatchCharLength: 2,
        keys: [
          { name: "title", weight: 0.4 },
          { name: "description", weight: 0.25 },
          { name: "headings", weight: 0.2 },
          { name: "keywords", weight: 0.1 },
          { name: "body", weight: 0.05 },
        ],
      });
      state.ready = true;
      state.loading = null;
    });
    return state.loading;
  }

  function svgSearch() {
    return (
      '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2">' +
      '<circle cx="11" cy="11" r="7"></circle>' +
      '<path d="M20 20l-3.5-3.5" stroke-linecap="round"></path>' +
      "</svg>"
    );
  }

  function injectTriggers() {
    if ($(".tp-search-trigger")) return;

    var desktopHost = document.querySelector(
      'nav .bar__module a.btn[href="/contact/"], nav .bar__module a.btn[href*="/contact"]'
    );
    if (desktopHost && desktopHost.parentElement) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tp-search-trigger";
      btn.setAttribute("aria-label", "Open site search");
      btn.setAttribute("aria-haspopup", "dialog");
      btn.innerHTML = svgSearch();
      btn.addEventListener("click", openSearch);
      desktopHost.parentElement.insertBefore(btn, desktopHost);
    }

    var mobileBar = document.querySelector(".bar.bar--sm.visible-xs .text-right");
    if (mobileBar && !mobileBar.querySelector(".tp-search-trigger")) {
      var mbtn = document.createElement("button");
      mbtn.type = "button";
      mbtn.className = "tp-search-trigger";
      mbtn.setAttribute("aria-label", "Open site search");
      mbtn.innerHTML = svgSearch();
      mbtn.addEventListener("click", openSearch);
      var hamburger = mobileBar.querySelector(".hamburger-toggle");
      if (hamburger) mobileBar.insertBefore(mbtn, hamburger);
      else mobileBar.appendChild(mbtn);
    }
  }

  function buildOverlay() {
    if ($("#tp-search-overlay")) return;
    var el = document.createElement("div");
    el.id = "tp-search-overlay";
    el.className = "tp-search-overlay";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "Site search");
    el.innerHTML =
      '<div class="tp-search-panel">' +
      '  <div class="tp-search-bar">' +
      svgSearch() +
      '    <input class="tp-search-input" id="tp-search-input" type="search" placeholder="Search products, industries, blog…" autocomplete="off" enterkeyhint="search" aria-autocomplete="list" aria-controls="tp-search-results" />' +
      '    <button type="button" class="tp-search-close" aria-label="Close search">&times;</button>' +
      "  </div>" +
      '  <div class="tp-search-results" id="tp-search-results" role="listbox"></div>' +
      "</div>";
    document.body.appendChild(el);

    el.addEventListener("click", function (e) {
      if (e.target === el) closeSearch();
    });
    $(".tp-search-close", el).addEventListener("click", closeSearch);
    $("#tp-search-input", el).addEventListener("input", onInput);
    $("#tp-search-input", el).addEventListener("keydown", onKeydown);
  }

  function openSearch() {
    buildOverlay();
    state.lastFocused = document.activeElement;
    var overlay = $("#tp-search-overlay");
    overlay.classList.add("is-open");
    state.open = true;
    state.active = -1;
    document.documentElement.style.overflow = "hidden";
    var input = $("#tp-search-input");
    input.value = "";
    renderHint();
    setTimeout(function () {
      input.focus();
    }, 10);
    ensureAssets().catch(function () {
      $("#tp-search-results").innerHTML =
        '<div class="tp-search-hint">Search is temporarily unavailable. Browse <a href="/led-ticker-tape/">products</a> or <a href="/contact/">contact us</a>.</div>';
    });
  }

  function closeSearch() {
    var overlay = $("#tp-search-overlay");
    if (!overlay) return;
    overlay.classList.remove("is-open");
    state.open = false;
    state.active = -1;
    document.documentElement.style.overflow = "";
    if (state.lastFocused && state.lastFocused.focus) {
      try {
        state.lastFocused.focus();
      } catch (e) {}
    }
  }

  var debounceTimer = null;
  function onInput(e) {
    var q = e.target.value;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      runSearch(q);
    }, DEBOUNCE_MS);
  }

  function runSearch(q) {
    q = (q || "").trim();
    state.active = -1;
    if (!q) {
      renderHint();
      return;
    }
    ensureAssets().then(function () {
      var hits = state.fuse.search(q, { limit: 24 });
      state.results = hits.map(function (h) {
        return h.item;
      });
      renderResults(q, state.results);
    });
  }

  function snippetFor(item) {
    return item.description || item.headings || item.body || "";
  }

  function truncate(s, n) {
    s = (s || "").replace(/\s+/g, " ").trim();
    if (s.length <= n) return s;
    return s.slice(0, n - 1).trim() + "…";
  }

  function renderHint() {
    $("#tp-search-results").innerHTML =
      '<div class="tp-search-hint">Type to search LED tickers, industries, and articles. Use ↑ ↓ to move, Enter to open, Esc to close.</div>';
    state.results = [];
  }

  function emptyState(q) {
    var links = FALLBACK_LINKS.map(function (l) {
      return '<a href="' + l.href + '">' + l.label + "</a>";
    }).join("");
    return (
      '<div class="tp-search-empty">' +
      "<h3>No results for “" +
      escapeHtml(q) +
      "”</h3>" +
      "<p>Try a different term, or browse popular pages:</p>" +
      '<div class="tp-search-empty-links">' +
      links +
      "</div></div>"
    );
  }

  function renderResults(q, items) {
    var root = $("#tp-search-results");
    if (!items.length) {
      root.innerHTML = emptyState(q);
      return;
    }
    var grouped = {};
    TYPE_ORDER.forEach(function (t) {
      grouped[t] = [];
    });
    items.forEach(function (item) {
      var t = grouped[item.type] ? item.type : "Pages";
      grouped[t].push(item);
    });

    var html = "";
    var idx = 0;
    TYPE_ORDER.forEach(function (type) {
      var list = grouped[type];
      if (!list.length) return;
      html += '<div class="tp-search-group-label">' + type + "</div>";
      list.forEach(function (item) {
        html +=
          '<a class="tp-search-item" role="option" id="tp-search-opt-' +
          idx +
          '" href="' +
          escapeAttr(item.url) +
          '" data-idx="' +
          idx +
          '">' +
          '<span class="tp-search-item-title">' +
          escapeHtml(item.title) +
          "</span>" +
          '<span class="tp-search-item-snippet">' +
          escapeHtml(truncate(snippetFor(item), 120)) +
          "</span></a>";
        idx += 1;
      });
    });
    root.innerHTML = html;
    root.querySelectorAll(".tp-search-item").forEach(function (a) {
      a.addEventListener("mousemove", function () {
        setActive(parseInt(a.getAttribute("data-idx"), 10));
      });
    });
  }

  function setActive(i) {
    var items = document.querySelectorAll("#tp-search-results .tp-search-item");
    items.forEach(function (el) {
      el.classList.remove("is-active");
    });
    if (i < 0 || i >= items.length) {
      state.active = -1;
      return;
    }
    state.active = i;
    items[i].classList.add("is-active");
    items[i].scrollIntoView({ block: "nearest" });
  }

  function onKeydown(e) {
    var items = document.querySelectorAll("#tp-search-results .tp-search-item");
    if (e.key === "Escape") {
      e.preventDefault();
      closeSearch();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!items.length) return;
      setActive(state.active < items.length - 1 ? state.active + 1 : 0);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!items.length) return;
      setActive(state.active > 0 ? state.active - 1 : items.length - 1);
      return;
    }
    if (e.key === "Enter") {
      if (state.active >= 0 && items[state.active]) {
        e.preventDefault();
        window.location.href = items[state.active].getAttribute("href");
        return;
      }
      if (state.results.length) {
        e.preventDefault();
        window.location.href = state.results[0].url;
      }
    }
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  document.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (state.open) closeSearch();
      else openSearch();
    }
  });

  function init() {
    injectTriggers();
    buildOverlay();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
