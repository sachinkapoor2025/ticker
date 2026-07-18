/**
 * Map visitor page journeys → interest scores + suggested Tickerplay products.
 */

const PRODUCTS = [
  {
    path: "/led-stock-ticker/",
    name: "LED Stock Ticker",
    interests: ["stock", "finance", "trading"],
    keywords: ["stock", "trading", "nasdaq", "nyse", "equity"],
  },
  {
    path: "/led-financial-ticker/",
    name: "LED Financial Ticker",
    interests: ["finance", "banking"],
    keywords: ["financial", "bank", "broker", "wealth"],
  },
  {
    path: "/stock-market-ticker/",
    name: "Stock Market Ticker",
    interests: ["stock", "finance"],
    keywords: ["stock market", "market ticker"],
  },
  {
    path: "/led-sports-ticker/",
    name: "LED Sports Ticker",
    interests: ["sports", "venues"],
    keywords: ["sports", "score", "stadium", "bar"],
  },
  {
    path: "/sports-bars/",
    name: "Sports Bar Solutions",
    interests: ["sports", "hospitality"],
    keywords: ["sports bar", "bar", "restaurant"],
  },
  {
    path: "/led-news-ticker/",
    name: "LED News Ticker",
    interests: ["news", "media"],
    keywords: ["news", "headline", "rss"],
  },
  {
    path: "/indoor-ticker-tape/",
    name: "Indoor LED Ticker Tape",
    interests: ["indoor", "hardware"],
    keywords: ["indoor"],
  },
  {
    path: "/outdoor-ticker-tape/",
    name: "Outdoor LED Ticker Tape",
    interests: ["outdoor", "hardware"],
    keywords: ["outdoor", "weatherproof"],
  },
  {
    path: "/flexible-ticker-tape/",
    name: "Flexible LED Ticker",
    interests: ["flexible", "custom"],
    keywords: ["flexible", "curve"],
  },
  {
    path: "/circular-ticker-tape/",
    name: "Circular LED Ticker",
    interests: ["circular", "custom"],
    keywords: ["circular", "round"],
  },
  {
    path: "/custom-led-ticker-tape/",
    name: "Custom LED Ticker",
    interests: ["custom", "enterprise"],
    keywords: ["custom", "bespoke"],
  },
  {
    path: "/led-ticker-tape/",
    name: "LED Ticker Tape (overview)",
    interests: ["general", "hardware"],
    keywords: ["ticker tape", "led ticker"],
  },
  {
    path: "/trading-labs/",
    name: "Trading Lab Displays",
    interests: ["education", "finance"],
    keywords: ["trading lab", "finance lab"],
  },
  {
    path: "/university-finance-lab/",
    name: "University Finance Lab",
    interests: ["education", "finance"],
    keywords: ["university", "campus", "school"],
  },
  {
    path: "/corporate-floors/",
    name: "Corporate Floor Displays",
    interests: ["corporate", "office"],
    keywords: ["corporate", "lobby", "office"],
  },
  {
    path: "/investment-firms/",
    name: "Investment Firm Displays",
    interests: ["finance", "corporate"],
    keywords: ["investment", "asset"],
  },
  {
    path: "/wealth-management-firms/",
    name: "Wealth Management Displays",
    interests: ["finance", "wealth"],
    keywords: ["wealth"],
  },
  {
    path: "/multi-time-zone-digital-wall-clock/",
    name: "Multi Time Zone Wall Clock",
    interests: ["clock", "office"],
    keywords: ["clock", "timezone", "time zone"],
  },
  {
    path: "/programmable-scrolling-led-sign/",
    name: "Programmable Scrolling LED Sign",
    interests: ["signage", "messaging"],
    keywords: ["programmable", "scrolling sign", "message board"],
  },
  {
    path: "/contact/",
    name: "Contact / Quote",
    interests: ["intent_high"],
    keywords: ["quote", "pricing", "contact"],
  },
];

const INTEREST_LABELS = {
  stock: "Stock / trading tickers",
  finance: "Financial displays",
  trading: "Trading floors & labs",
  sports: "Sports tickers & venues",
  hospitality: "Bars & hospitality",
  news: "News tickers",
  media: "Media / headlines",
  indoor: "Indoor installs",
  outdoor: "Outdoor installs",
  flexible: "Flexible form factors",
  circular: "Circular / architectural",
  custom: "Custom projects",
  hardware: "Hardware / form factor",
  education: "Schools & universities",
  corporate: "Corporate offices",
  wealth: "Wealth management",
  office: "Office environments",
  clock: "World clocks",
  signage: "Programmable signs",
  messaging: "Messaging boards",
  venues: "Sports venues",
  banking: "Banks & brokerages",
  enterprise: "Enterprise / custom",
  general: "LED tickers (general)",
  intent_high: "High purchase intent",
};

function normalizePath(p) {
  if (!p) return "/";
  let s = String(p).split("?")[0].split("#")[0];
  if (!s.startsWith("/")) s = "/" + s;
  if (s.length > 1 && !s.endsWith("/")) s += "/";
  return s.toLowerCase();
}

function visitorIdFromSession(sessionId) {
  const raw = String(sessionId || "anon");
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = (h * 31 + raw.charCodeAt(i)) >>> 0;
  return "V-" + (h.toString(16).padStart(8, "0") + raw.slice(-4)).slice(0, 12).toUpperCase();
}

function analyzeJourney(session, events) {
  const interestScores = new Map();
  const productScores = new Map();
  const pathCounts = new Map();
  const keywords = new Map();

  function bumpInterest(key, w = 1) {
    if (!key) return;
    interestScores.set(key, (interestScores.get(key) || 0) + w);
  }
  function bumpProduct(path, w = 1) {
    productScores.set(path, (productScores.get(path) || 0) + w);
  }

  const allEvents = events || session.timeline || [];
  const paths = [];

  for (const e of allEvents) {
    const path = normalizePath(e.path || "");
    if (e.type === "page_view" || !e.type) {
      pathCounts.set(path, (pathCounts.get(path) || 0) + 1);
      paths.push(path);
      for (const p of PRODUCTS) {
        if (path === p.path || path.startsWith(p.path.replace(/\/$/, ""))) {
          bumpProduct(p.path, 3);
          for (const i of p.interests) bumpInterest(i, 3);
        }
      }
      // Industry / vertical pages
      if (path.includes("school") || path.includes("business-school") || path.includes("university")) {
        bumpInterest("education", 2);
      }
      if (path.includes("corporate") || path.includes("showroom")) bumpInterest("corporate", 2);
      if (path.includes("why-tickerplay")) bumpInterest("intent_high", 2);
      if (path.includes("industries")) bumpInterest("general", 1);
    }
    if (e.type === "search" && e.query) {
      const q = String(e.query).toLowerCase();
      keywords.set(q, (keywords.get(q) || 0) + 1);
      for (const p of PRODUCTS) {
        for (const kw of p.keywords) {
          if (q.includes(kw)) {
            bumpProduct(p.path, 4);
            for (const i of p.interests) bumpInterest(i, 2);
          }
        }
      }
    }
    if (e.type === "cta_click") {
      bumpInterest("intent_high", 3);
      const label = String(e.label || e.path || "").toLowerCase();
      if (label.includes("contact") || label.includes("quote") || label.includes("pricing")) {
        bumpInterest("intent_high", 2);
        bumpProduct("/contact/", 2);
      }
    }
  }

  // Session-level path list fallback
  for (const p of session.paths || []) {
    const path = normalizePath(p);
    if (!pathCounts.has(path)) pathCounts.set(path, 1);
  }

  const lookingFor = [...interestScores.entries()]
    .filter(([k]) => k !== "intent_high")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([key, score]) => ({
      key,
      label: INTEREST_LABELS[key] || key,
      score,
    }));

  const suggestedProducts = [...productScores.entries()]
    .filter(([path]) => path !== "/contact/")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([path, score]) => {
      const prod = PRODUCTS.find((p) => p.path === path);
      return {
        path,
        name: prod?.name || path,
        score,
        reason: (prod?.interests || [])
          .map((i) => INTEREST_LABELS[i] || i)
          .slice(0, 2)
          .join(", "),
      };
    });

  // If no product hits, suggest from top interest
  if (!suggestedProducts.length && lookingFor.length) {
    const top = lookingFor[0].key;
    for (const p of PRODUCTS) {
      if (p.interests.includes(top) && p.path !== "/contact/") {
        suggestedProducts.push({
          path: p.path,
          name: p.name,
          score: lookingFor[0].score,
          reason: INTEREST_LABELS[top] || top,
        });
      }
      if (suggestedProducts.length >= 3) break;
    }
  }

  const topPages = [...pathCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([path, count]) => ({ path, count }));

  const intentScore = interestScores.get("intent_high") || 0;
  let intentLevel = "browsing";
  if (intentScore >= 6 || (session.ctaClicks || 0) >= 2) intentLevel = "high";
  else if (intentScore >= 3 || (session.ctaClicks || 0) >= 1) intentLevel = "medium";

  const summaryParts = [];
  if (lookingFor[0]) summaryParts.push(lookingFor[0].label);
  if (lookingFor[1]) summaryParts.push(lookingFor[1].label);
  if (intentLevel === "high") summaryParts.push("likely ready for a quote");

  return {
    visitorId: visitorIdFromSession(session.sessionId),
    lookingFor,
    suggestedProducts,
    topPages,
    searchKeywords: [...keywords.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([query, count]) => ({ query, count })),
    intentLevel,
    intentScore,
    summary: summaryParts.length
      ? `This visitor appears interested in ${summaryParts.join(" · ")}.`
      : "Not enough page activity yet to infer product interest.",
  };
}

module.exports = {
  PRODUCTS,
  analyzeJourney,
  visitorIdFromSession,
  normalizePath,
};
