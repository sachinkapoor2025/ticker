/**
 * Tickerplay first-party analytics beacon
 * Tracks page views, time-on-page, heartbeats (live users), searches, CTA clicks,
 * device/geo/UTM metadata. Never blocks UX.
 */
(function () {
  try {
    if (window.__tpBeaconLoaded) return;
    window.__tpBeaconLoaded = true;

    var SID_KEY = "tp_sid";
    var GEO_KEY = "tp_geo";
    var ENDPOINT = "/api/analytics";
    var GEO_ENDPOINT = "/api/geo";
    var HEARTBEAT_MS = 30000;
    var queue = [];
    var flushTimer = null;
    var pageEnteredAt = Date.now();
    var currentPath = location.pathname + location.search;
    var clientMeta = null;
    var geoReady = null;

    function sessionId() {
      var sid = localStorage.getItem(SID_KEY);
      if (!sid) {
        sid =
          Math.random().toString(36).slice(2) +
          Date.now().toString(36) +
          Math.random().toString(36).slice(2, 6);
        localStorage.setItem(SID_KEY, sid);
      }
      return sid;
    }

    function parseDevice(ua) {
      var deviceType = "Unknown";
      if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(ua)) deviceType = "Tablet";
      else if (/mobile|iphone|ipod|android|blackberry|iemobile|opera mini/i.test(ua))
        deviceType = "Mobile";
      else if (/windows|macintosh|linux|cros/i.test(ua)) deviceType = "Desktop";

      var browser = "Other";
      if (/edg\//i.test(ua)) browser = "Edge";
      else if (/opr\//i.test(ua) || /opera/i.test(ua)) browser = "Opera";
      else if (/chrome\//i.test(ua) && !/edg\//i.test(ua)) browser = "Chrome";
      else if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) browser = "Safari";
      else if (/firefox\//i.test(ua)) browser = "Firefox";
      else if (/msie|trident/i.test(ua)) browser = "IE";

      var os = "Other";
      if (/windows nt/i.test(ua)) os = "Windows";
      else if (/mac os x/i.test(ua) && !/iphone|ipad/i.test(ua)) os = "macOS";
      else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
      else if (/android/i.test(ua)) os = "Android";
      else if (/cros/i.test(ua)) os = "ChromeOS";
      else if (/linux/i.test(ua)) os = "Linux";

      return { deviceType: deviceType, browser: browser, os: os, userAgent: ua.slice(0, 300) };
    }

    function utmFromUrl() {
      var p = new URLSearchParams(location.search);
      return {
        utmSource: p.get("utm_source") || "",
        utmMedium: p.get("utm_medium") || "",
        utmCampaign: p.get("utm_campaign") || "",
        utmTerm: p.get("utm_term") || p.get("q") || p.get("s") || p.get("query") || "",
      };
    }

    function getMeta() {
      if (clientMeta) return clientMeta;
      clientMeta = {};
      try {
        clientMeta.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
        clientMeta.locale = navigator.language || "";
        if (screen && screen.width) clientMeta.screen = screen.width + "x" + screen.height;
        var device = parseDevice(navigator.userAgent || "");
        clientMeta.userAgent = device.userAgent;
        clientMeta.deviceType = device.deviceType;
        clientMeta.browser = device.browser;
        clientMeta.os = device.os;
        var utm = utmFromUrl();
        clientMeta.utmSource = utm.utmSource;
        clientMeta.utmMedium = utm.utmMedium;
        clientMeta.utmCampaign = utm.utmCampaign;
        clientMeta.utmTerm = utm.utmTerm;
        try {
          var cached = JSON.parse(sessionStorage.getItem(GEO_KEY) || "null");
          if (cached && cached.country) {
            clientMeta.country = cached.country || "";
            clientMeta.city = cached.city || "";
            clientMeta.region = cached.region || "";
            clientMeta.regionName = cached.regionName || "";
          }
        } catch (e) {}
      } catch (e) {}
      return clientMeta;
    }

    function ensureGeo() {
      if (geoReady) return geoReady;
      geoReady = fetch(GEO_ENDPOINT, { cache: "no-store" })
        .then(function (res) {
          return res.ok ? res.json() : null;
        })
        .then(function (data) {
          if (!data || typeof data !== "object") return;
          getMeta();
          ["country", "city", "region", "regionName"].forEach(function (k) {
            if (data[k]) clientMeta[k] = data[k];
          });
          try {
            sessionStorage.setItem(
              GEO_KEY,
              JSON.stringify({
                country: clientMeta.country || "",
                city: clientMeta.city || "",
                region: clientMeta.region || "",
                regionName: clientMeta.regionName || "",
              })
            );
          } catch (e) {}
        })
        .catch(function () {});
      return geoReady;
    }

    function send(body, useBeacon) {
      var payload = JSON.stringify(body);
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: "application/json" }));
        return;
      }
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(function () {});
    }

    function flush(immediateBeacon) {
      if (!queue.length) return;
      var events = queue.slice();
      queue = [];
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      send({ events: events }, !!immediateBeacon);
    }

    function enqueue(evt, immediate) {
      var meta = Object.assign({}, getMeta(), evt.metadata || {});
      queue.push({
        type: evt.type || "page_view",
        path: evt.path || currentPath,
        referrer: document.referrer || "",
        sessionId: sessionId(),
        query: evt.query || "",
        resultCount: evt.resultCount,
        label: evt.label || "",
        at: new Date().toISOString(),
        metadata: meta,
        utmSource: meta.utmSource,
        utmMedium: meta.utmMedium,
        utmCampaign: meta.utmCampaign,
        utmTerm: meta.utmTerm,
      });
      if (immediate || queue.length >= 8) {
        flush(immediate === "beacon");
        return;
      }
      if (!flushTimer) {
        flushTimer = setTimeout(function () {
          flushTimer = null;
          flush(false);
        }, 1200);
      }
    }

    function trackPageView(path) {
      currentPath = path || location.pathname + location.search;
      pageEnteredAt = Date.now();
      ensureGeo().finally(function () {
        enqueue({ type: "page_view", path: currentPath }, true);
      });
    }

    function trackLeave() {
      var durationMs = Date.now() - pageEnteredAt;
      if (durationMs < 500) return;
      enqueue(
        {
          type: "session_ping",
          path: currentPath,
          metadata: { durationMs: String(durationMs) },
        },
        "beacon"
      );
    }

    function heartbeat() {
      if (document.visibilityState === "hidden") return;
      enqueue(
        {
          type: "heartbeat",
          path: currentPath,
          metadata: { durationMs: String(Date.now() - pageEnteredAt) },
        },
        true
      );
    }

    function trackSearch(query, resultCount) {
      var q = String(query || "").trim();
      if (q.length < 2) return;
      enqueue(
        {
          type: "search",
          query: q.toLowerCase(),
          resultCount: typeof resultCount === "number" ? resultCount : undefined,
          path: currentPath,
        },
        true
      );
    }

    function trackCta(label, path) {
      enqueue(
        {
          type: "cta_click",
          label: String(label || "cta").slice(0, 120),
          path: path || currentPath,
        },
        true
      );
    }

    // Public API for pages / forms
    window.tpTrackSearch = trackSearch;
    window.tpTrackCta = trackCta;
    window.tpSessionId = sessionId;

    // Attach session id + page to contact forms automatically
    function enhanceForms() {
      var forms = document.querySelectorAll("form");
      for (var i = 0; i < forms.length; i++) {
        var form = forms[i];
        if (form.dataset.tpEnhanced) continue;
        form.dataset.tpEnhanced = "1";
        form.addEventListener(
          "submit",
          function () {
            try {
              var sidInput = this.querySelector('input[name="sessionId"]');
              if (!sidInput) {
                sidInput = document.createElement("input");
                sidInput.type = "hidden";
                sidInput.name = "sessionId";
                this.appendChild(sidInput);
              }
              sidInput.value = sessionId();
              var pageInput = this.querySelector('input[name="page"]');
              if (!pageInput) {
                pageInput = document.createElement("input");
                pageInput.type = "hidden";
                pageInput.name = "page";
                this.appendChild(pageInput);
              }
              pageInput.value = location.pathname;
              trackCta("form_submit:" + (this.id || this.getAttribute("action") || "form"));
            } catch (e) {}
          },
          true
        );
      }
    }

    // Track on-site search boxes
    function bindSearchInputs() {
      document.addEventListener(
        "submit",
        function (e) {
          var form = e.target;
          if (!form || form.tagName !== "FORM") return;
          var input =
            form.querySelector('input[type="search"]') ||
            form.querySelector('input[name="q"]') ||
            form.querySelector('input[name="s"]') ||
            form.querySelector('input[name="query"]');
          if (input && input.value) trackSearch(input.value);
        },
        true
      );
    }

    // Track primary CTA links (pricing / contact / request)
    function bindCtas() {
      document.addEventListener(
        "click",
        function (e) {
          var a = e.target && e.target.closest ? e.target.closest("a, button") : null;
          if (!a) return;
          var text = (a.textContent || "").trim().toLowerCase();
          var href = (a.getAttribute("href") || "").toLowerCase();
          var interesting =
            href.indexOf("/contact") >= 0 ||
            href.indexOf("request") >= 0 ||
            href.indexOf("pricing") >= 0 ||
            text.indexOf("request pricing") >= 0 ||
            text.indexOf("get a quote") >= 0 ||
            text.indexOf("contact") >= 0 ||
            a.classList.contains("btn") ||
            a.id === "openModal";
          if (interesting) {
            trackCta((text || href || "cta").slice(0, 80), href || currentPath);
          }
        },
        true
      );
    }

    // UTM / query keyword on landing
    function trackLandingKeyword() {
      var utm = utmFromUrl();
      if (utm.utmTerm && utm.utmTerm.length >= 2) {
        trackSearch(utm.utmTerm);
      }
    }

    ensureGeo();
    trackPageView();
    trackLandingKeyword();
    enhanceForms();
    bindSearchInputs();
    bindCtas();
    setInterval(heartbeat, HEARTBEAT_MS);

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") trackLeave();
      else {
        pageEnteredAt = Date.now();
        heartbeat();
      }
    });
    window.addEventListener("pagehide", trackLeave);

    // Re-enhance forms added later (modals)
    setTimeout(enhanceForms, 1500);
    setTimeout(enhanceForms, 4000);
  } catch (e) {}
})();
