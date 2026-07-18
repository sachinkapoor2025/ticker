(function () {
  try {
    var key = "tp_sid";
    var sid = localStorage.getItem(key);
    if (!sid) {
      sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(key, sid);
    }
    var payload = {
      path: location.pathname + location.search,
      referrer: document.referrer || "",
      sessionId: sid,
    };
    var body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/analytics", new Blob([body], { type: "application/json" }));
    } else {
      fetch("/api/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body,
        keepalive: true,
      }).catch(function () {});
    }
  } catch (e) {}
})();
