/* Tickerplay Admin Portal — Cognito + /api/admin/* */
(function () {
  const CFG = window.TP_ADMIN_CONFIG || {};
  const REGION = CFG.region || "us-east-1";
  const CLIENT_ID = CFG.userPoolClientId || "";
  const API = CFG.apiBase || "/api/admin";
  const STORAGE = "tp_admin_cognito";

  const NAV = [
    { id: "dashboard", label: "Dashboard" },
    { id: "live", label: "Live users", live: true },
    { id: "analytics", label: "Analytics" },
    { id: "searches", label: "Searches" },
    { id: "visitors", label: "Visitor journeys" },
    { id: "leads", label: "Enquiries" },
  ];

  const RANGE_PRESETS = [
    { id: "today", label: "Today" },
    { id: "3d", label: "3 days" },
    { id: "7d", label: "1 week" },
    { id: "30d", label: "1 month" },
    { id: "custom", label: "Custom" },
  ];

  const state = {
    auth: loadAuth(),
    view: "dashboard",
    rangePreset: "30d",
    customFrom: "",
    customTo: "",
    overview: null,
    analytics: null,
    searches: null,
    sessions: [],
    leads: [],
    live: [],
    error: "",
    loading: false,
    challenge: null,
    challengeUser: "",
    menuOpen: false,
    drawer: null,
    leadFilter: { status: "all", q: "" },
    sessionFilter: { q: "", device: "all", identity: "all" },
    liveTimer: null,
    toast: "",
  };

  function rangeQuery() {
    if (state.rangePreset === "custom" && state.customFrom && state.customTo) {
      return `from=${encodeURIComponent(state.customFrom)}&to=${encodeURIComponent(state.customTo)}`;
    }
    return `preset=${encodeURIComponent(state.rangePreset || "30d")}`;
  }

  function rangeLabel() {
    if (state.rangePreset === "custom" && state.customFrom && state.customTo) {
      return `${state.customFrom} → ${state.customTo}`;
    }
    return (RANGE_PRESETS.find((p) => p.id === state.rangePreset) || {}).label || "1 month";
  }

  function loadAuth() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE) || "null");
    } catch {
      return null;
    }
  }
  function saveAuth(a) {
    if (a) localStorage.setItem(STORAGE, JSON.stringify(a));
    else localStorage.removeItem(STORAGE);
    state.auth = a;
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function decodeJwt(token) {
    const part = token.split(".")[1];
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  }

  function groupsOf(token) {
    try {
      return decodeJwt(token)["cognito:groups"] || [];
    } catch {
      return [];
    }
  }

  function isAdminToken(token) {
    const g = groupsOf(token);
    return g.includes("admin") || g.includes("super-admin");
  }

  async function cognitoCall(target, body) {
    const res = await fetch(`https://cognito-idp.${REGION}.amazonaws.com/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": target,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.__type) {
      throw new Error(data.message || data.__type || "Auth failed");
    }
    return data;
  }

  async function cognitoLogin(username, password) {
    if (!CLIENT_ID) throw new Error("Cognito client not configured. Deploy API stack first.");
    const data = await cognitoCall("AWSCognitoIdentityProviderService.InitiateAuth", {
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: CLIENT_ID,
      AuthParameters: { USERNAME: username, PASSWORD: password },
    });
    if (data.ChallengeName === "NEW_PASSWORD_REQUIRED") {
      state.challenge = data;
      state.challengeUser = username;
      throw new Error("NEW_PASSWORD_REQUIRED");
    }
    const idToken = data.AuthenticationResult?.IdToken;
    if (!idToken) throw new Error("No ID token returned");
    if (!isAdminToken(idToken)) {
      throw new Error("Access denied: your Cognito user is not in the admin group.");
    }
    const payload = decodeJwt(idToken);
    saveAuth({
      email: payload.email || username,
      idToken,
      accessToken: data.AuthenticationResult.AccessToken,
      refreshToken: data.AuthenticationResult.RefreshToken,
      expiresAt: Date.now() + (data.AuthenticationResult.ExpiresIn || 3600) * 1000,
    });
  }

  async function completeNewPassword(newPassword) {
    const data = await cognitoCall("AWSCognitoIdentityProviderService.RespondToAuthChallenge", {
      ClientId: CLIENT_ID,
      ChallengeName: "NEW_PASSWORD_REQUIRED",
      Session: state.challenge.Session,
      ChallengeResponses: {
        USERNAME: state.challengeUser,
        NEW_PASSWORD: newPassword,
      },
    });
    const idToken = data.AuthenticationResult?.IdToken;
    if (!idToken) throw new Error("Password update failed");
    if (!isAdminToken(idToken)) {
      throw new Error("Access denied: add this user to the Cognito admin group.");
    }
    const payload = decodeJwt(idToken);
    state.challenge = null;
    saveAuth({
      email: payload.email || state.challengeUser,
      idToken,
      accessToken: data.AuthenticationResult.AccessToken,
      refreshToken: data.AuthenticationResult.RefreshToken,
      expiresAt: Date.now() + (data.AuthenticationResult.ExpiresIn || 3600) * 1000,
    });
  }

  async function refreshTokenIfNeeded() {
    if (!state.auth?.refreshToken || !state.auth?.expiresAt) return;
    if (Date.now() < state.auth.expiresAt - 120000) return;
    try {
      const data = await cognitoCall("AWSCognitoIdentityProviderService.InitiateAuth", {
        AuthFlow: "REFRESH_TOKEN_AUTH",
        ClientId: CLIENT_ID,
        AuthParameters: { REFRESH_TOKEN: state.auth.refreshToken },
      });
      const idToken = data.AuthenticationResult?.IdToken;
      if (!idToken) return;
      saveAuth({
        ...state.auth,
        idToken,
        accessToken: data.AuthenticationResult.AccessToken || state.auth.accessToken,
        expiresAt: Date.now() + (data.AuthenticationResult.ExpiresIn || 3600) * 1000,
      });
    } catch {
      /* keep existing token; api will 401 if truly expired */
    }
  }

  async function api(path, opts = {}) {
    await refreshTokenIfNeeded();
    if (!state.auth?.idToken) throw new Error("Unauthorized");
    const headers = Object.assign(
      { "Content-Type": "application/json", Authorization: "Bearer " + state.auth.idToken },
      opts.headers || {}
    );
    const res = await fetch(API + path, Object.assign({}, opts, { headers }));
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) {
      saveAuth(null);
      render();
      throw new Error(data.error || "Unauthorized");
    }
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  function fmtTime(iso) {
    if (!iso) return "—";
    return String(iso).replace("T", " ").slice(0, 19);
  }
  function fmtDur(ms) {
    const s = Math.round((ms || 0) / 1000);
    if (s < 60) return s + "s";
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (m < 60) return m + "m " + r + "s";
    return Math.floor(m / 60) + "h " + (m % 60) + "m";
  }
  function shortHost(ref) {
    if (!ref) return "direct";
    try {
      return new URL(ref).hostname.replace(/^www\./, "");
    } catch {
      return String(ref).slice(0, 40);
    }
  }

  function downloadCsv(filename, rows) {
    if (!rows.length) {
      state.toast = "Nothing to export";
      return;
    }
    const keys = Object.keys(rows[0]);
    const lines = [
      keys.join(","),
      ...rows.map((r) =>
        keys
          .map((k) => {
            const v = r[k] == null ? "" : String(r[k]);
            return `"${v.replace(/"/g, '""')}"`;
          })
          .join(",")
      ),
    ];
    // UTF-8 BOM so Excel opens columns cleanly
    const blob = new Blob(["\ufeff" + lines.join("\n")], {
      type: "application/vnd.ms-excel;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename.endsWith(".csv") ? filename.replace(/\.csv$/, ".xls") : filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function downloadPdf(title, columns, rows) {
    const jspdf = window.jspdf;
    if (!jspdf?.jsPDF) {
      state.toast = "PDF library failed to load — try Excel export";
      render();
      return;
    }
    const doc = new jspdf.jsPDF({ orientation: columns.length > 5 ? "landscape" : "portrait" });
    doc.setFontSize(14);
    doc.text(title, 14, 16);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Tickerplay Admin · ${rangeLabel()} · ${new Date().toISOString().slice(0, 16)}`, 14, 22);
    doc.setTextColor(0);
    doc.autoTable({
      startY: 28,
      head: [columns.map((c) => c.label)],
      body: rows.map((r) => columns.map((c) => String(r[c.key] ?? ""))),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [3, 110, 177] },
    });
    doc.save(title.replace(/\s+/g, "-").toLowerCase() + ".pdf");
  }

  function exportButtons(idPrefix) {
    return `<div class="export-btns">
      <button type="button" class="secondary" id="${idPrefix}Excel">Download Excel</button>
      <button type="button" class="secondary" id="${idPrefix}Pdf">Download PDF</button>
    </div>`;
  }

  function kpi(label, value, sub, cls) {
    return `<div class="kpi ${cls || ""}"><div class="label">${esc(label)}</div><b>${esc(value)}</b>${
      sub ? `<div class="sub">${esc(sub)}</div>` : ""
    }</div>`;
  }

  function barChart(data, valueKey = "pageViews") {
    if (!data.length) return '<p class="muted">No data yet.</p>';
    const max = Math.max(1, ...data.map((d) => d[valueKey] || d.count || 0));
    const showLabel = (i) =>
      i === 0 || i === data.length - 1 || data.length <= 10 || i % Math.ceil(data.length / 7) === 0;
    return `
      <div class="bars">${data
        .map((d) => {
          const v = d[valueKey] || d.count || 0;
          const h = Math.round((v / max) * 100);
          return `<div class="bar-wrap" title="${esc(d.day || d.label)}: ${v}"><div class="bar" style="height:${h}%"></div></div>`;
        })
        .join("")}</div>
      <div class="bar-labels">${data
        .map((d, i) => {
          const label = d.day || d.label || "";
          return `<span>${showLabel(i) ? esc(String(label).slice(5) || label) : ""}</span>`;
        })
        .join("")}</div>`;
  }

  function hBars(items, maxItems = 10) {
    const slice = (items || []).slice(0, maxItems);
    if (!slice.length) return '<p class="muted">No data yet.</p>';
    const max = Math.max(1, ...slice.map((i) => i.count || i.value || 0));
    return slice
      .map((item) => {
        const v = item.count || item.value || 0;
        const label = item.label || item.path || "—";
        return `<div class="hbar">
          <div class="meta"><span title="${esc(label)}">${esc(String(label).slice(0, 48))}</span><span>${v.toLocaleString()}</span></div>
          <div class="track"><div class="fill" style="width:${Math.round((v / max) * 100)}%"></div></div>
        </div>`;
      })
      .join("");
  }

  function rangeControl() {
    return `<div class="range-bar">
      <div class="range-presets" role="group" aria-label="Date range">
        ${RANGE_PRESETS.map(
          (p) =>
            `<button type="button" class="range-btn ${state.rangePreset === p.id ? "active" : ""}" data-range="${p.id}">${p.label}</button>`
        ).join("")}
      </div>
      ${
        state.rangePreset === "custom"
          ? `<div class="range-custom">
              <input type="date" id="customFrom" value="${esc(state.customFrom)}" />
              <span class="muted">to</span>
              <input type="date" id="customTo" value="${esc(state.customTo)}" />
              <button type="button" id="applyCustomRange">Apply</button>
            </div>`
          : `<span class="muted range-label">${esc(rangeLabel())}</span>`
      }
    </div>`;
  }

  async function loadAll() {
    state.loading = true;
    state.error = "";
    render();
    try {
      const q = rangeQuery();
      const [overview, analytics, searches, sessions, leads, live] = await Promise.all([
        api(`/overview?${q}`),
        api(`/analytics?${q}`),
        api(`/searches?${q}`),
        api(`/sessions?${q}`),
        api(`/leads?${q}`),
        api(`/live`),
      ]);
      state.overview = overview;
      state.analytics = analytics;
      state.searches = searches;
      state.sessions = sessions.sessions || [];
      state.leads = leads.leads || [];
      state.live = live.live || [];
    } catch (e) {
      state.error = e.message || String(e);
    }
    state.loading = false;
    render();
    startLivePolling();
  }

  async function refreshLive() {
    try {
      const live = await api("/live");
      state.live = live.live || [];
      if (state.overview) state.overview.liveCount = live.count || state.live.length;
      if (state.view === "live" || state.view === "dashboard") {
        const liveCountEl = document.getElementById("liveCountKpi");
        if (liveCountEl) liveCountEl.textContent = String(state.live.length);
        if (state.view === "live") renderMainOnly();
        else {
          const livePreview = document.getElementById("livePreview");
          if (livePreview) livePreview.innerHTML = livePreviewHtml();
        }
      }
      const badge = document.getElementById("liveBadge");
      if (badge) badge.textContent = String(state.live.length);
    } catch {
      /* ignore poll errors */
    }
  }

  function startLivePolling() {
    if (state.liveTimer) clearInterval(state.liveTimer);
    state.liveTimer = setInterval(refreshLive, 15000);
  }

  function renderMainOnly() {
    const el = document.getElementById("mainContent");
    if (!el) return render();
    el.innerHTML = viewBody();
    bindViewEvents();
  }

  function livePreviewHtml() {
    const rows = state.live.slice(0, 8);
    if (!rows.length) return '<p class="muted">No one on the site right now.</p>';
    return rows
      .map(
        (u) => `<div class="live-row">
        <span class="live-pulse"></span>
        <div style="flex:1;min-width:0">
          <div><strong>${esc(u.path || "/")}</strong></div>
          <div class="muted">${esc(u.location || u.country || "—")} · ${esc(u.deviceType || "")} · ${esc(u.browser || "")}</div>
        </div>
        <div class="muted" style="white-space:nowrap">${esc(fmtTime(u.lastSeen).slice(11))}</div>
      </div>`
      )
      .join("");
  }

  function viewDashboard() {
    const t = state.overview?.totals || {};
    const days = state.overview?.trafficByDay || [];
    const top = state.overview?.topPages || [];
    const recent = state.overview?.recentLeads || [];
    const byStatus = state.overview?.byStatus || {};
    const interests = state.overview?.interestTrends || [];
    const products = state.overview?.suggestedProductTrends || [];
    return `
      <div class="card-head" style="margin-bottom:12px">
        <span class="muted">Report range: ${esc(rangeLabel())}</span>
        ${exportButtons("dashExport")}
      </div>
      <div class="grid grid-6">
        ${kpi("Live now", state.live.length, "on website", "live")}
        ${kpi("Page views", t.pageViewsInRange ?? t.pageViewsLast30d ?? 0, rangeLabel())}
        ${kpi("Visitors", t.uniqueSessions ?? 0, (t.withContact || 0) + " left contact")}
        ${kpi("Enquiries", t.leadsInRange ?? t.leadsLast30d ?? 0, (t.leads ?? 0) + " all-time", "accent")}
        ${kpi("Converted", t.converted ?? 0, (t.conversionRate ?? 0) + "% of leads", "orange")}
        ${kpi("View → lead", (t.leadConversionVsViews ?? 0) + "%", "enquiry rate")}
      </div>
      <div class="grid grid-2">
        <div class="card">
          <div class="card-head"><h2>Traffic trend</h2><span class="muted">${esc(rangeLabel())}</span></div>
          ${barChart(days)}
        </div>
        <div class="card">
          <div class="card-head">
            <h2>Live on site <span class="pill soft">${state.live.length}</span></h2>
            <button type="button" class="secondary" data-goto="live">Open live</button>
          </div>
          <div id="livePreview">${livePreviewHtml()}</div>
        </div>
      </div>
      <div class="grid grid-2">
        <div class="card">
          <h2>What visitors are looking for</h2>
          <p class="muted" style="margin-top:-4px;margin-bottom:10px;">Inferred from page journeys, searches, and CTAs in this range.</p>
          ${hBars(interests, 10)}
        </div>
        <div class="card">
          <h2>Suggested products (aggregate)</h2>
          <p class="muted" style="margin-top:-4px;margin-bottom:10px;">Best-fit products based on visitor journeys.</p>
          ${hBars(products, 10)}
        </div>
      </div>
      <div class="grid grid-3">
        <div class="card"><h2>Top pages</h2>${hBars(top.map((p) => ({ label: p.path, count: p.count })))}</div>
        <div class="card"><h2>Devices</h2>${hBars(state.overview?.devices || [])}</div>
        <div class="card"><h2>Countries</h2>${hBars(state.overview?.countries || [])}</div>
      </div>
      <div class="grid grid-2">
        <div class="card">
          <h2>Pipeline</h2>
          <div class="row" style="gap:10px;margin-bottom:12px;">
            ${["new", "contacted", "follow_up", "converted", "closed"]
              .map((s) => `<span class="pill ${s}">${s}: ${byStatus[s] || 0}</span>`)
              .join("")}
          </div>
          <p class="muted">Move leads through the enquiry pipeline on the Enquiries page.</p>
        </div>
        <div class="card">
          <div class="card-head"><h2>Newest enquiries</h2><button type="button" class="secondary" data-goto="leads">All leads</button></div>
          <table><thead><tr><th>When</th><th>Contact</th><th>Status</th></tr></thead>
          <tbody>${
            recent
              .map(
                (l) => `<tr>
              <td class="muted">${esc(fmtTime(l.createdAt).slice(0, 16))}</td>
              <td><b>${esc(l.name || "—")}</b><br/><span class="muted">${esc(l.email || "")} ${esc(l.mobile || "")}</span></td>
              <td><span class="pill ${esc(l.status || "new")}">${esc(l.status || "new")}</span></td>
            </tr>`
              )
              .join("") || '<tr><td colspan="3" class="muted">No leads yet</td></tr>'
          }</tbody></table>
        </div>
      </div>`;
  }

  function viewLive() {
    const rows = state.live;
    return `
      <div class="grid grid-4">
        ${kpi("Live users", rows.length, "active in last ~90s", "live")}
        ${kpi("Mobile", rows.filter((r) => r.deviceType === "Mobile").length, "right now")}
        ${kpi("Desktop", rows.filter((r) => r.deviceType === "Desktop").length, "right now")}
        ${kpi("Countries", new Set(rows.map((r) => r.country).filter(Boolean)).size, "distinct")}
      </div>
      <div class="card">
        <div class="card-head">
          <h2>Who’s browsing now</h2>
          <span class="muted">Auto-refreshes every 15s</span>
        </div>
        ${
          rows.length
            ? `<table><thead><tr><th></th><th>Page</th><th>Location</th><th>Device</th><th>Browser</th><th>Last seen</th><th>Session</th></tr></thead>
          <tbody>${rows
            .map(
              (u) => `<tr class="clickable" data-session="${esc(u.sessionId)}">
              <td><span class="live-pulse"></span></td>
              <td><strong>${esc(u.path || "/")}</strong></td>
              <td>${esc(u.location || u.country || "—")}</td>
              <td><span class="pill device">${esc(u.deviceType || "—")}</span></td>
              <td class="muted">${esc(u.browser || "")} / ${esc(u.os || "")}</td>
              <td class="muted">${esc(fmtTime(u.lastSeen))}</td>
              <td class="muted">${esc((u.sessionId || "").slice(0, 10))}</td>
            </tr>`
            )
            .join("")}</tbody></table>`
            : '<div class="empty">No live visitors at this moment. Heartbeats update as people browse the public site.</div>'
        }
      </div>`;
  }

  function viewAnalytics() {
    const a = state.analytics || {};
    const t = a.totals || {};
    return `
      <div class="card-head" style="margin-bottom:12px">
        <span class="muted">${esc(rangeLabel())}</span>
        ${exportButtons("analyticsExport")}
      </div>
      <div class="grid grid-4">
        ${kpi("Page views", t.pageViews ?? 0, rangeLabel())}
        ${kpi("Sessions", t.uniqueSessions ?? 0, (t.avgPagesPerSession ?? 0) + " pages/session")}
        ${kpi("Avg duration", (t.avgDurationSec ?? 0) + "s", "time on site")}
        ${kpi("CTA clicks", t.ctaClicks ?? 0, "pricing / contact interest", "accent")}
      </div>
      <div class="card">
        <div class="card-head"><h2>Daily traffic</h2></div>
        ${barChart(a.trafficByDay || [])}
      </div>
      <div class="grid grid-2">
        <div class="card"><h2>Top pages</h2>${hBars(a.topPages || [], 15)}</div>
        <div class="card"><h2>Traffic sources</h2>${hBars(a.sources || [], 15)}</div>
      </div>
      <div class="grid grid-3">
        <div class="card"><h2>Devices</h2>${hBars(a.devices || [])}</div>
        <div class="card"><h2>Browsers</h2>${hBars(a.browsers || [])}</div>
        <div class="card"><h2>Operating systems</h2>${hBars(a.os || [])}</div>
      </div>
      <div class="grid grid-2">
        <div class="card"><h2>Countries / regions</h2>${hBars(a.countries || [], 15)}</div>
        <div class="card"><h2>Top CTAs</h2>${hBars(a.topCtas || [], 12)}</div>
      </div>`;
  }

  function viewSearches() {
    const s = state.searches || {};
    const list = s.searches || [];
    return `
      <div class="grid grid-3">
        ${kpi("Total searches", s.totalSearches ?? 0, rangeLabel())}
        ${kpi("Unique keywords", s.uniqueKeywords ?? 0, "distinct terms")}
        ${kpi("Zero-result", (s.zeroResult || []).length, "keywords needing content", "orange")}
      </div>
      <div class="card">
        <div class="card-head">
          <h2>Top searched keywords</h2>
          ${exportButtons("searchExport")}
        </div>
        <p class="muted" style="margin-top:-6px;margin-bottom:12px;">
          Captures on-site search, UTM terms (<code>utm_term</code>), and landing query params (<code>q</code>/<code>s</code>).
        </p>
        <table><thead><tr><th>#</th><th>Keyword</th><th>Times searched</th><th>Zero results</th></tr></thead>
        <tbody>${
          list
            .map(
              (k, i) => `<tr>
            <td class="muted">${i + 1}</td>
            <td><strong>${esc(k.label)}</strong></td>
            <td>${k.count}</td>
            <td>${k.zero || 0}</td>
          </tr>`
            )
            .join("") || '<tr><td colspan="4" class="muted">No keyword data yet — traffic with utm_term or site search will appear here.</td></tr>'
        }</tbody></table>
      </div>`;
  }

  function viewVisitors() {
    let list = state.sessions || [];
    const q = (state.sessionFilter.q || "").toLowerCase();
    const device = state.sessionFilter.device;
    const identity = state.sessionFilter.identity || "all";
    if (q) {
      list = list.filter(
        (s) =>
          (s.lastPath || "").toLowerCase().includes(q) ||
          (s.location || "").toLowerCase().includes(q) ||
          (s.sessionId || "").toLowerCase().includes(q) ||
          (s.visitorId || "").toLowerCase().includes(q) ||
          (s.topInterest || "").toLowerCase().includes(q) ||
          (s.suggestedProduct || "").toLowerCase().includes(q) ||
          (s.contact?.email || "").toLowerCase().includes(q) ||
          (s.contact?.mobile || "").toLowerCase().includes(q) ||
          (s.referrer || "").toLowerCase().includes(q)
      );
    }
    if (device !== "all") list = list.filter((s) => s.deviceType === device);
    if (identity === "known") list = list.filter((s) => s.contact?.hasContact);
    if (identity === "anon") list = list.filter((s) => !s.contact?.hasContact);
    return `
      <div class="grid grid-4">
        ${kpi("Visitors", state.sessions.length, rangeLabel())}
        ${kpi("Left contact", state.sessions.filter((s) => s.contact?.hasContact).length, "form submit")}
        ${kpi("High intent", state.sessions.filter((s) => s.intentLevel === "high").length, "quote / CTA", "accent")}
        ${kpi("CTA engaged", state.sessions.filter((s) => s.ctaClicks > 0).length)}
      </div>
      <div class="card">
        <div class="card-head">
          <h2>Visitor journeys</h2>
          ${exportButtons("sessionExport")}
        </div>
        <p class="muted" style="margin-top:-6px;margin-bottom:12px;">
          Each visitor has a unique ID. Email / phone appear only after they submit a form.
          Click a row for full journey, interest graph, and suggested products.
        </p>
        <div class="filters">
          <input type="search" id="sessionQ" placeholder="Search visitor ID, interest, path, email…" value="${esc(state.sessionFilter.q)}" />
          <select id="sessionDevice">
            ${["all", "Desktop", "Mobile", "Tablet", "Unknown"]
              .map(
                (d) =>
                  `<option value="${d}" ${device === d ? "selected" : ""}>${d === "all" ? "All devices" : d}</option>`
              )
              .join("")}
          </select>
          <select id="sessionIdentity">
            <option value="all" ${identity === "all" ? "selected" : ""}>All visitors</option>
            <option value="known" ${identity === "known" ? "selected" : ""}>With contact details</option>
            <option value="anon" ${identity === "anon" ? "selected" : ""}>Anonymous only</option>
          </select>
        </div>
        <table><thead><tr>
          <th>Visitor ID</th><th>Last seen</th><th>Looking for</th><th>Suggested product</th>
          <th>Contact</th><th>Location</th><th>Pages</th><th>Intent</th>
        </tr></thead>
        <tbody>${
          list
            .slice(0, 250)
            .map(
              (s) => `<tr class="clickable" data-session="${esc(s.sessionId)}">
            <td><strong>${esc(s.visitorId || "—")}</strong>
              <div class="muted" style="font-size:11px">${esc((s.sessionId || "").slice(0, 10))}…</div></td>
            <td class="muted">${esc(fmtTime(s.lastSeen))}</td>
            <td>${esc(s.topInterest || "—")}
              <div class="muted">${(s.interestPreview || []).slice(1, 3).map((i) => esc(i.label || i)).join(" · ")}</div>
            </td>
            <td><strong>${esc(s.suggestedProduct || "—")}</strong>
              <div class="muted">${esc((s.paths || []).slice(0, 2).join(" → "))}</div></td>
            <td>${
              s.contact?.hasContact
                ? `<span class="pill accent">Known</span>
                   <div class="muted">${esc(s.contact.name || "")}<br/>${esc(s.contact.email || "")}<br/>${esc(s.contact.mobile || "")}</div>`
                : '<span class="muted">—</span>'
            }</td>
            <td>${esc(s.location || s.country || "—")}
              <div class="muted">${esc(s.deviceType || "")}</div></td>
            <td>${s.pageViews || 0}<div class="muted">${esc(fmtDur(s.durationMs))}</div></td>
            <td><span class="pill ${esc(s.intentLevel || "browsing")}">${esc(s.intentLevel || "browsing")}</span></td>
          </tr>`
            )
            .join("") || '<tr><td colspan="8" class="muted">No visitor journeys in this range</td></tr>'
        }</tbody></table>
      </div>`;
  }

  function viewLeads() {
    let list = state.leads || [];
    const st = state.leadFilter.status;
    const q = (state.leadFilter.q || "").toLowerCase();
    if (st !== "all") list = list.filter((l) => (l.status || "new") === st);
    if (q) {
      list = list.filter(
        (l) =>
          (l.name || "").toLowerCase().includes(q) ||
          (l.email || "").toLowerCase().includes(q) ||
          (l.mobile || "").toLowerCase().includes(q) ||
          (l.company || "").toLowerCase().includes(q) ||
          (l.message || "").toLowerCase().includes(q)
      );
    }
    return `
      <div class="grid grid-4">
        ${kpi("All enquiries", state.leads.length)}
        ${kpi("New", state.leads.filter((l) => (l.status || "new") === "new").length, "", "live")}
        ${kpi("Follow up", state.leads.filter((l) => l.status === "follow_up").length, "", "orange")}
        ${kpi("Converted", state.leads.filter((l) => l.status === "converted").length, "", "accent")}
      </div>
      <div class="card">
        <div class="card-head">
          <h2>Enquiry pipeline</h2>
          ${exportButtons("leadExport")}
        </div>
        <div class="filters">
          <input type="search" id="leadQ" placeholder="Search name, email, company…" value="${esc(state.leadFilter.q)}" />
          <select id="leadStatus">
            ${["all", "new", "contacted", "follow_up", "converted", "closed"]
              .map(
                (s) =>
                  `<option value="${s}" ${st === s ? "selected" : ""}>${s === "all" ? "All statuses" : s}</option>`
              )
              .join("")}
          </select>
        </div>
        <table>
          <thead><tr><th>Date</th><th>Lead</th><th>Page / source</th><th>Status</th><th>Assignee</th><th>Notes</th><th></th></tr></thead>
          <tbody>
          ${
            list
              .map(
                (l) => `
            <tr>
              <td class="muted">${esc((l.createdAt || "").slice(0, 10))}</td>
              <td>
                <b>${esc(l.name || "—")}</b><br/>
                <span class="muted">${esc(l.email || "")}<br/>${esc(l.mobile || "")}<br/>${esc(l.country || "")}${l.company ? " · " + esc(l.company) : ""}</span>
                <div style="margin-top:6px">${esc((l.message || "").slice(0, 180))}</div>
              </td>
              <td class="muted">${esc(l.page || "—")}<br/>${esc(l.source || "contact")}${l.utmSource ? "<br/>utm: " + esc(l.utmSource) : ""}</td>
              <td>
                <select data-id="${esc(l.id)}" class="status" style="min-width:120px">
                  ${["new", "contacted", "follow_up", "converted", "closed"]
                    .map(
                      (s) =>
                        `<option value="${s}" ${(l.status || "new") === s ? "selected" : ""}>${s}</option>`
                    )
                    .join("")}
                </select>
              </td>
              <td><input data-id="${esc(l.id)}" class="assign" value="${esc(l.assignedTo || "")}" placeholder="Owner" style="min-width:100px" /></td>
              <td><textarea data-id="${esc(l.id)}" class="notes" rows="2">${esc(l.adminNotes || "")}</textarea></td>
              <td><button type="button" data-id="${esc(l.id)}" class="save secondary">Save</button></td>
            </tr>`
              )
              .join("") || '<tr><td colspan="7" class="muted">No enquiries yet</td></tr>'
          }
          </tbody>
        </table>
      </div>`;
  }

  function viewTitles() {
    return {
      dashboard: ["Dashboard", "Live traffic, enquiries, and conversion at a glance."],
      live: ["Live users", "See who is on tickerplay.com right now and which page they’re on."],
      analytics: ["Analytics", "Devices, locations, sources, pages, and engagement."],
      searches: ["Search keywords", "What visitors search for and how often."],
      visitors: [
        "Visitor journeys",
        "Unique visitor IDs, inferred interests, suggested products. Contact details only after form submit.",
      ],
      leads: ["Enquiries CRM", "Contact-us leads — status, owner, notes, PDF/Excel export."],
    }[state.view] || ["Admin", ""];
  }

  function viewBody() {
    if (state.loading && !state.overview) {
      return '<div class="card"><p class="muted">Loading dashboard…</p></div>';
    }
    switch (state.view) {
      case "live":
        return viewLive();
      case "analytics":
        return viewAnalytics();
      case "searches":
        return viewSearches();
      case "visitors":
        return viewVisitors();
      case "leads":
        return viewLeads();
      default:
        return viewDashboard();
    }
  }

  function drawerHtml() {
    if (!state.drawer) return "";
    const d = state.drawer;
    const s = d.session || {};
    const interest = d.interest || s.interest || {};
    const contact = d.contact || s.contact || {};
    const events = d.events || s.timeline || [];
    const looking = interest.lookingFor || [];
    const products = interest.suggestedProducts || [];
    return `
      <div class="drawer-backdrop" id="drawerClose"></div>
      <aside class="drawer drawer-wide">
        <div class="drawer-head">
          <div>
            <h2 style="margin:0 0 4px;font-size:1.1rem;">${esc(s.visitorId || "Visitor journey")}</h2>
            <div class="muted">${esc(s.location || "—")} · ${esc(interest.intentLevel || "browsing")} intent</div>
          </div>
          <div class="row">
            <button type="button" class="secondary" id="drawerExcel">Excel</button>
            <button type="button" class="secondary" id="drawerPdf">PDF</button>
            <button type="button" class="secondary" id="drawerCloseBtn">Close</button>
          </div>
        </div>
        <div class="drawer-body">
          <p class="interest-summary">${esc(interest.summary || "")}</p>
          <div class="grid" style="grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">
            <div class="kpi"><div class="label">Device</div><b style="font-size:16px">${esc(s.deviceType || "—")}</b></div>
            <div class="kpi"><div class="label">Duration</div><b style="font-size:16px">${esc(fmtDur(s.durationMs))}</b></div>
            <div class="kpi"><div class="label">Pages</div><b style="font-size:16px">${s.pageViews || 0}</b></div>
            <div class="kpi"><div class="label">Source</div><b style="font-size:14px">${esc(s.utmSource || shortHost(s.referrer))}</b></div>
          </div>

          <div class="card soft-card" style="margin-bottom:14px;">
            <h3 style="margin:0 0 8px;font-size:14px;">Contact details</h3>
            ${
              contact.hasContact
                ? `<div class="contact-block">
                    <div><span class="muted">Name</span><br/><strong>${esc(contact.name || "—")}</strong></div>
                    <div><span class="muted">Email</span><br/><strong>${esc(contact.email || "—")}</strong></div>
                    <div><span class="muted">Phone</span><br/><strong>${esc(contact.mobile || "—")}</strong></div>
                    <div><span class="muted">Company</span><br/><strong>${esc(contact.company || "—")}</strong></div>
                  </div>`
                : `<p class="muted" style="margin:0">No form submit yet — email/phone stay hidden until this visitor enquires.</p>`
            }
          </div>

          <h3 style="margin:0 0 8px;font-size:14px;">What they’re looking for</h3>
          <div style="margin-bottom:14px;">${hBars(looking.map((i) => ({ label: i.label, count: i.score })), 8)}</div>

          <h3 style="margin:0 0 8px;font-size:14px;">Suggested products</h3>
          <div class="product-suggestions" style="margin-bottom:16px;">
            ${
              products
                .map(
                  (p) => `<a class="product-chip" href="${esc(p.path)}" target="_blank" rel="noopener">
                    <strong>${esc(p.name)}</strong>
                    <span class="muted">${esc(p.reason || "")}</span>
                  </a>`
                )
                .join("") || '<p class="muted">Browse more product pages to refine suggestions.</p>'
            }
          </div>

          <h3 style="margin:0 0 10px;font-size:14px;">Journey timeline</h3>
          <div class="timeline">
            ${
              events
                .map((e) => {
                  const type = e.type || "page_view";
                  let detail = e.path || "";
                  if (type === "search") detail = `"${e.query || ""}"`;
                  if (type === "cta_click") detail = e.label || e.path || "CTA";
                  if (type === "session_ping") detail = fmtDur(e.durationMs) + " on page";
                  return `<div class="tl-item ${esc(type)}">
                    <div class="muted" style="font-size:11px">${esc(fmtTime(e.at || e.createdAt))}</div>
                    <div><strong>${esc(type.replace(/_/g, " "))}</strong> · ${esc(detail)}</div>
                  </div>`;
                })
                .join("") || '<p class="muted">No events</p>'
            }
          </div>
        </div>
      </aside>`;
  }

  async function openSession(sessionId) {
    try {
      const data = await api(`/sessions/${encodeURIComponent(sessionId)}?${rangeQuery()}`);
      state.drawer = data;
      render();
    } catch (e) {
      state.error = e.message;
      render();
    }
  }

  function renderLogin() {
    const needNewPw = state.challenge?.ChallengeName === "NEW_PASSWORD_REQUIRED";
    document.getElementById("root").innerHTML = `
      <div class="login-screen">
        <div class="login-card">
          <picture>
            <source type="image/webp" srcset="/img/logo-dark.webp" />
            <img class="logo" src="/img/logo-dark.png" alt="Tickerplay" />
          </picture>
          <h1>Admin portal</h1>
          <p class="muted">Sign in with your Cognito admin account to manage leads, analytics, and live visitors.</p>
          <form id="loginForm">
            ${
              needNewPw
                ? `<p class="muted">Set a new password to finish first-time login.</p>
                   <input type="password" id="newPassword" placeholder="New password" required minlength="10" autocomplete="new-password" />
                   <button type="submit">Set password &amp; continue</button>`
                : `<input type="email" id="username" placeholder="Email" required autocomplete="username" />
                   <input type="password" id="password" placeholder="Password" required autocomplete="current-password" />
                   <button type="submit">Sign in</button>`
            }
          </form>
          <div class="err" id="loginErr" style="margin-top:10px"></div>
        </div>
      </div>`;
    document.getElementById("loginForm").onsubmit = async (e) => {
      e.preventDefault();
      const errEl = document.getElementById("loginErr");
      errEl.textContent = "";
      try {
        if (needNewPw) {
          await completeNewPassword(document.getElementById("newPassword").value);
        } else {
          await cognitoLogin(
            document.getElementById("username").value.trim(),
            document.getElementById("password").value
          );
        }
        await loadAll();
      } catch (err) {
        if (err.message === "NEW_PASSWORD_REQUIRED") {
          render();
          return;
        }
        errEl.textContent = err.message || String(err);
      }
    };
  }

  function bindViewEvents() {
    document.querySelectorAll("[data-goto]").forEach((b) => {
      b.onclick = () => {
        state.view = b.dataset.goto;
        render();
      };
    });
    document.querySelectorAll("[data-session]").forEach((row) => {
      row.onclick = () => openSession(row.dataset.session);
    });
    document.querySelectorAll("[data-range]").forEach((btn) => {
      btn.onclick = () => {
        state.rangePreset = btn.dataset.range;
        if (state.rangePreset === "custom") {
          if (!state.customFrom) state.customFrom = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
          if (!state.customTo) state.customTo = new Date().toISOString().slice(0, 10);
          render();
          return;
        }
        loadAll();
      };
    });
    const applyCustom = document.getElementById("applyCustomRange");
    if (applyCustom) {
      applyCustom.onclick = () => {
        state.customFrom = document.getElementById("customFrom")?.value || "";
        state.customTo = document.getElementById("customTo")?.value || "";
        if (!state.customFrom || !state.customTo) {
          state.toast = "Pick both start and end dates";
          render();
          return;
        }
        loadAll();
      };
    }

    // --- Exports ---
    const dashRows = () => [
      { metric: "Page views", value: state.overview?.totals?.pageViewsInRange ?? 0 },
      { metric: "Visitors", value: state.overview?.totals?.uniqueSessions ?? 0 },
      { metric: "Enquiries", value: state.overview?.totals?.leadsInRange ?? 0 },
      { metric: "Converted", value: state.overview?.totals?.converted ?? 0 },
      ...(state.overview?.interestTrends || []).map((i) => ({
        metric: "Interest: " + i.label,
        value: i.count,
      })),
      ...(state.overview?.suggestedProductTrends || []).map((i) => ({
        metric: "Product: " + i.label,
        value: i.count,
      })),
    ];
    const bindExport = (excelId, pdfId, title, columns, rowsFn) => {
      const ex = document.getElementById(excelId);
      const pdf = document.getElementById(pdfId);
      if (ex) ex.onclick = () => downloadCsv(title + ".xls", rowsFn());
      if (pdf) pdf.onclick = () => downloadPdf(title, columns, rowsFn());
    };
    bindExport("dashExportExcel", "dashExportPdf", "tickerplay-dashboard", [
      { key: "metric", label: "Metric" },
      { key: "value", label: "Value" },
    ], dashRows);
    bindExport("analyticsExportExcel", "analyticsExportPdf", "tickerplay-analytics", [
      { key: "path", label: "Path / Label" },
      { key: "count", label: "Count" },
    ], () =>
      (state.analytics?.topPages || []).map((p) => ({
        path: p.label || p.path,
        count: p.count,
      }))
    );
    bindExport("searchExportExcel", "searchExportPdf", "tickerplay-searches", [
      { key: "keyword", label: "Keyword" },
      { key: "count", label: "Count" },
      { key: "zero_results", label: "Zero results" },
    ], () =>
      (state.searches?.searches || []).map((k) => ({
        keyword: k.label,
        count: k.count,
        zero_results: k.zero || 0,
      }))
    );
    bindExport("sessionExportExcel", "sessionExportPdf", "tickerplay-visitor-journeys", [
      { key: "visitorId", label: "Visitor ID" },
      { key: "lastSeen", label: "Last seen" },
      { key: "topInterest", label: "Looking for" },
      { key: "suggestedProduct", label: "Suggested product" },
      { key: "email", label: "Email" },
      { key: "mobile", label: "Phone" },
      { key: "location", label: "Location" },
      { key: "pageViews", label: "Pages" },
      { key: "intentLevel", label: "Intent" },
    ], () =>
      state.sessions.map((s) => ({
        visitorId: s.visitorId,
        lastSeen: s.lastSeen,
        topInterest: s.topInterest,
        suggestedProduct: s.suggestedProduct,
        email: s.contact?.hasContact ? s.contact.email || "" : "",
        mobile: s.contact?.hasContact ? s.contact.mobile || "" : "",
        location: s.location,
        pageViews: s.pageViews,
        intentLevel: s.intentLevel,
      }))
    );
    bindExport("leadExportExcel", "leadExportPdf", "tickerplay-leads", [
      { key: "createdAt", label: "Date" },
      { key: "name", label: "Name" },
      { key: "email", label: "Email" },
      { key: "mobile", label: "Phone" },
      { key: "status", label: "Status" },
      { key: "page", label: "Page" },
      { key: "message", label: "Message" },
    ], () =>
      state.leads.map((l) => ({
        createdAt: l.createdAt,
        name: l.name,
        email: l.email,
        mobile: l.mobile,
        status: l.status,
        page: l.page,
        message: l.message,
      }))
    );

    const drawerExcel = document.getElementById("drawerExcel");
    const drawerPdf = document.getElementById("drawerPdf");
    if (drawerExcel || drawerPdf) {
      const s = state.drawer?.session || {};
      const interest = state.drawer?.interest || s.interest || {};
      const rows = [
        { field: "Visitor ID", value: s.visitorId },
        { field: "Intent", value: interest.intentLevel },
        { field: "Summary", value: interest.summary },
        ...(interest.lookingFor || []).map((i) => ({ field: "Interest", value: `${i.label} (${i.score})` })),
        ...(interest.suggestedProducts || []).map((p) => ({
          field: "Suggested product",
          value: `${p.name} — ${p.path}`,
        })),
        ...(state.drawer?.events || []).map((e) => ({
          field: e.type || "event",
          value: `${e.createdAt || e.at || ""} ${e.path || e.query || e.label || ""}`,
        })),
      ];
      const cols = [
        { key: "field", label: "Field" },
        { key: "value", label: "Value" },
      ];
      if (drawerExcel) drawerExcel.onclick = () => downloadCsv("visitor-journey.xls", rows);
      if (drawerPdf) drawerPdf.onclick = () => downloadPdf("Visitor journey " + (s.visitorId || ""), cols, rows);
    }

    const sessionQ = document.getElementById("sessionQ");
    if (sessionQ) {
      sessionQ.oninput = () => {
        state.sessionFilter.q = sessionQ.value;
        renderMainOnly();
      };
    }
    const sessionDevice = document.getElementById("sessionDevice");
    if (sessionDevice) {
      sessionDevice.onchange = () => {
        state.sessionFilter.device = sessionDevice.value;
        renderMainOnly();
      };
    }
    const sessionIdentity = document.getElementById("sessionIdentity");
    if (sessionIdentity) {
      sessionIdentity.onchange = () => {
        state.sessionFilter.identity = sessionIdentity.value;
        renderMainOnly();
      };
    }
    const leadQ = document.getElementById("leadQ");
    if (leadQ) {
      leadQ.oninput = () => {
        state.leadFilter.q = leadQ.value;
        renderMainOnly();
      };
    }
    const leadStatus = document.getElementById("leadStatus");
    if (leadStatus) {
      leadStatus.onchange = () => {
        state.leadFilter.status = leadStatus.value;
        renderMainOnly();
      };
    }
    document.querySelectorAll("button.save").forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        const status = document.querySelector(`select.status[data-id="${id}"]`)?.value;
        const adminNotes = document.querySelector(`textarea.notes[data-id="${id}"]`)?.value;
        const assignedTo = document.querySelector(`input.assign[data-id="${id}"]`)?.value;
        btn.disabled = true;
        try {
          await api("/leads/" + encodeURIComponent(id), {
            method: "PATCH",
            body: JSON.stringify({ status, adminNotes, assignedTo }),
          });
          state.toast = "Lead saved";
          const leads = await api("/leads");
          state.leads = leads.leads || [];
          render();
        } catch (e) {
          state.error = e.message;
          render();
        }
      };
    });
    const drawerClose = document.getElementById("drawerClose");
    const drawerCloseBtn = document.getElementById("drawerCloseBtn");
    const closeDrawer = () => {
      state.drawer = null;
      render();
    };
    if (drawerClose) drawerClose.onclick = closeDrawer;
    if (drawerCloseBtn) drawerCloseBtn.onclick = closeDrawer;
  }

  function render() {
    if (!state.auth?.idToken || !isAdminToken(state.auth.idToken) || state.challenge) {
      if (state.liveTimer) clearInterval(state.liveTimer);
      return renderLogin();
    }

    const [title, subtitle] = viewTitles();
    document.getElementById("root").innerHTML = `
      <div class="mobile-bar">
        <button type="button" class="menu-toggle" id="menuOpen" aria-label="Menu">☰</button>
        <strong>Tickerplay Admin</strong>
        <span class="pill soft">${state.live.length} live</span>
      </div>
      <div class="backdrop ${state.menuOpen ? "show" : ""}" id="backdrop"></div>
      <div class="app-shell">
        <aside class="sidebar ${state.menuOpen ? "open" : ""}">
          <div class="sidebar-brand">
            <a class="logo-plate" href="/" title="Tickerplay home" target="_blank" rel="noopener">
              <picture>
                <source type="image/webp" srcset="/img/logo-dark.webp" />
                <img src="/img/logo-dark.png" alt="Tickerplay" />
              </picture>
            </a>
            <div class="brand-text">
              <strong>Admin</strong>
              <span>Business dashboard</span>
            </div>
          </div>
          <nav>
            ${NAV.map(
              (n) => `<button type="button" class="nav-btn ${state.view === n.id ? "active" : ""}" data-nav="${n.id}">
                ${n.live ? '<span class="dot-live"></span>' : ""}
                <span>${n.label}</span>
                ${n.live ? `<span class="badge-count" id="liveBadge">${state.live.length}</span>` : ""}
              </button>`
            ).join("")}
          </nav>
          <div class="sidebar-foot">
            <div class="user">${esc(state.auth.email || "")}</div>
            <button type="button" id="btnRefresh">Refresh data</button>
            <button type="button" id="btnLogout">Logout</button>
            <a class="btn-side" href="/" target="_blank" rel="noopener">View website</a>
          </div>
        </aside>
        <main class="main">
          <div class="topbar">
            <div>
              <h1>${esc(title)}</h1>
              <p class="muted" style="margin:0">${esc(subtitle)}</p>
            </div>
            <div class="topbar-right">
              ${state.loading ? '<span class="muted">Loading…</span>' : ""}
            </div>
          </div>
          ${rangeControl()}
          ${state.error ? `<div class="err" style="margin-bottom:12px">${esc(state.error)}</div>` : ""}
          ${state.toast ? `<div class="ok" style="margin-bottom:12px">${esc(state.toast)}</div>` : ""}
          <div id="mainContent">${viewBody()}</div>
        </main>
      </div>
      ${drawerHtml()}`;

    state.toast = "";

    document.querySelectorAll("[data-nav]").forEach((b) => {
      b.onclick = () => {
        state.view = b.dataset.nav;
        state.menuOpen = false;
        state.error = "";
        render();
      };
    });
    document.getElementById("btnRefresh").onclick = () => loadAll();
    document.getElementById("btnLogout").onclick = () => {
      saveAuth(null);
      if (state.liveTimer) clearInterval(state.liveTimer);
      render();
    };
    const menuOpen = document.getElementById("menuOpen");
    const backdrop = document.getElementById("backdrop");
    if (menuOpen) menuOpen.onclick = () => {
      state.menuOpen = true;
      render();
    };
    if (backdrop) backdrop.onclick = () => {
      state.menuOpen = false;
      render();
    };

    bindViewEvents();
  }

  if (state.auth?.idToken && isAdminToken(state.auth.idToken)) loadAll();
  else render();
})();
