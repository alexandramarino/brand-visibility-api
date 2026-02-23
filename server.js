import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.API_PORT || 3001;

app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────────────────
// ARTICLE TYPE CLASSIFIER
// ─────────────────────────────────────────────────────────
function classifyArticleType(title, snippet, url) {
  const text = `${title} ${snippet} ${url}`.toLowerCase();

  if (
    text.includes("sponsor") ||
    text.includes("paid post") ||
    text.includes("paid content") ||
    text.includes("partner content")
  ) return "Sponsored";

  if (
    text.includes("advertorial") ||
    text.includes("advertisement") ||
    text.includes("promoted")
  ) return "Advertorial";

  if (
    /\d+\s+(best|top|great|amazing|must.have)/.test(text) ||
    /(best|top)\s+\d+/.test(text) ||
    text.includes("ranked") ||
    text.includes("our picks") ||
    (text.match(/best .* of \d{4}/) && text.includes("list"))
  ) return "Listicle";

  if (
    text.includes("roundup") ||
    text.includes("we tested") ||
    text.includes("we tried") ||
    text.includes("product round") ||
    text.includes("top picks") ||
    text.includes("editor") && text.includes("pick")
  ) return "Product Roundup";

  if (
    text.includes("vs") ||
    text.includes("versus") ||
    text.includes("compared") ||
    text.includes("comparison") ||
    text.includes("head-to-head") ||
    text.includes("head to head")
  ) return "Comparison";

  if (
    text.includes("buying guide") ||
    text.includes("how to choose") ||
    text.includes("what to look for") ||
    text.includes("buyer") && text.includes("guide")
  ) return "Buying Guide";

  if (
    text.includes("review") ||
    text.includes("we tested") ||
    text.includes("hands on") ||
    text.includes("hands-on") ||
    text.includes("after using") ||
    text.includes("months of")
  ) return "Review";

  if (
    text.includes("announces") ||
    text.includes("launches") ||
    text.includes("new product") ||
    text.includes("breaking") ||
    text.includes("report:")
  ) return "News";

  return "Editorial";
}

// ─────────────────────────────────────────────────────────
// BRAND MENTION DETECTOR
// ─────────────────────────────────────────────────────────
function detectBrandMention(brand, title, snippet) {
  const brandLower = brand.toLowerCase();
  const text = `${title} ${snippet}`.toLowerCase();
  const mentioned = text.includes(brandLower);

  let position = null;
  if (mentioned) {
    // Try to extract a numbered position from the snippet
    const posMatch = snippet.match(new RegExp(`#?(\\d+)[^\\w]*${brandLower}|${brandLower}[^\\w]*(?:is|at|ranked|comes in at)?[^\\w]*#?(\\d+)`, "i"));
    if (posMatch) {
      position = parseInt(posMatch[1] || posMatch[2]);
    } else {
      // Rough heuristic: earlier mention = better position
      const idx = text.indexOf(brandLower);
      position = idx < 100 ? 1 : idx < 250 ? 2 : idx < 500 ? 3 : 4;
    }
  }

  return { mentioned, position };
}

// ─────────────────────────────────────────────────────────
// TRAFFIC ESTIMATOR (heuristic based on domain authority)
// ─────────────────────────────────────────────────────────
const DOMAIN_TRAFFIC_MAP = {
  "nytimes.com": 85000000,
  "forbes.com": 60000000,
  "businessinsider.com": 40000000,
  "buzzfeed.com": 30000000,
  "cnet.com": 25000000,
  "theverge.com": 20000000,
  "wired.com": 15000000,
  "tomsguide.com": 12000000,
  "pcmag.com": 10000000,
  "reviewed.com": 8000000,
  "goodhousekeeping.com": 18000000,
  "realsimple.com": 7000000,
  "apartmenttherapy.com": 9000000,
  "sleepfoundation.org": 5000000,
  "sleepopolis.com": 3000000,
  "healthline.com": 35000000,
  "verywellfit.com": 12000000,
  "outsideonline.com": 6000000,
  "gearpatrol.com": 2500000,
  "runnersworld.com": 4000000,
  "wirecutter.com": 22000000,
  "epicurious.com": 8000000,
  "bonappetit.com": 10000000,
  "seriouseats.com": 5000000,
  "foodandwine.com": 6000000,
  "vogue.com": 20000000,
  "elle.com": 12000000,
  "instyle.com": 8000000,
  "gq.com": 9000000,
  "wsj.com": 30000000,
  "bloomberg.com": 35000000,
  "reuters.com": 28000000,
  "bbc.com": 90000000,
  "cnn.com": 70000000,
};

function estimateTraffic(displayLink) {
  const domain = displayLink.replace("www.", "").toLowerCase();
  // Check exact match
  if (DOMAIN_TRAFFIC_MAP[domain]) {
    const base = DOMAIN_TRAFFIC_MAP[domain];
    // Articles get ~0.1–2% of site traffic
    return Math.floor(base * (0.001 + Math.random() * 0.018));
  }
  // Unknown domain: estimate based on TLD/length heuristic
  if (domain.endsWith(".org")) return Math.floor(50000 + Math.random() * 500000);
  if (domain.endsWith(".gov")) return Math.floor(100000 + Math.random() * 1000000);
  return Math.floor(10000 + Math.random() * 300000);
}

// ─────────────────────────────────────────────────────────
// GOOGLE SEARCH QUERIES FOR EDITORIAL ARTICLES
// ─────────────────────────────────────────────────────────
function buildSearchQueries(brand) {
  return [
    `best ${brand} review`,
    `${brand} editorial review site:forbes.com OR site:businessinsider.com OR site:wirecutter.com OR site:goodhousekeeping.com OR site:reviewed.com`,
    `"${brand}" recommended buying guide`,
    `${brand} top products ranked`,
  ];
}

// ─────────────────────────────────────────────────────────
// GOOGLE CUSTOM SEARCH
// ─────────────────────────────────────────────────────────
async function searchGoogle(query, apiKey, searchEngineId) {
  const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}&num=10`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google API error: ${res.status} — ${err}`);
  }
  const data = await res.json();
  return data.items || [];
}

// ─────────────────────────────────────────────────────────
// MAIN ARTICLES ENDPOINT
// ─────────────────────────────────────────────────────────
app.get("/api/articles", async (req, res) => {
  const { brand } = req.query;
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

  if (!brand) return res.status(400).json({ error: "brand query param required" });
  if (!apiKey || !searchEngineId) return res.status(500).json({ error: "Google API keys not configured" });

  try {
    const queries = buildSearchQueries(brand);
    const allResults = [];
    const seenUrls = new Set();

    // Run up to 2 queries to stay within free tier limits
    for (const query of queries.slice(0, 2)) {
      const items = await searchGoogle(query, apiKey, searchEngineId);
      for (const item of items) {
        if (seenUrls.has(item.link)) continue;
        seenUrls.add(item.link);

        const type = classifyArticleType(item.title, item.snippet || "", item.link);
        const { mentioned, position } = detectBrandMention(brand, item.title, item.snippet || "");
        const traffic = estimateTraffic(item.displayLink);

        allResults.push({
          id: allResults.length + 1,
          title: item.title,
          publisher: item.displayLink.replace("www.", ""),
          domain: item.displayLink.replace("www.", ""),
          url: item.link,
          type,
          monthlyTraffic: traffic,
          brandMentioned: mentioned,
          mentionPosition: position,
          snippet: item.snippet || "",
          publishDate: item.pagemap?.metatags?.[0]?.["article:published_time"]
            ? new Date(item.pagemap.metatags[0]["article:published_time"]).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
            : "Recent",
          sponsored: type === "Sponsored" || type === "Advertorial",
        });
      }
    }

    // Sort by traffic descending
    allResults.sort((a, b) => b.monthlyTraffic - a.monthlyTraffic);

    res.json({ articles: allResults, brand, total: allResults.length });
  } catch (err) {
    console.error("Articles error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    google: !!(process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_SEARCH_ENGINE_ID),
    openai: !!process.env.OPENAI_API_KEY,
  });
});

app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});
