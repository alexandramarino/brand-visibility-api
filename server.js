import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3001;
app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────────────────
// ARTICLE TYPE CLASSIFIER
// ─────────────────────────────────────────────────────────
function classifyArticleType(title, snippet, url) {
  const text = `${title} ${snippet} ${url}`.toLowerCase();
  if (text.includes("sponsor") || text.includes("paid post") || text.includes("paid content") || text.includes("partner content")) return "Sponsored";
  if (text.includes("advertorial") || text.includes("advertisement") || text.includes("promoted")) return "Advertorial";
  if (/\d+\s+(best|top|great|amazing|must.have)/.test(text) || /(best|top)\s+\d+/.test(text) || text.includes("ranked") || text.includes("our picks") || (text.match(/best .* of \d{4}/) && text.includes("list"))) return "Listicle";
  if (text.includes("roundup") || text.includes("we tested") || text.includes("we tried") || text.includes("product round") || text.includes("top picks") || (text.includes("editor") && text.includes("pick"))) return "Product Roundup";
  if (text.includes("vs") || text.includes("versus") || text.includes("compared") || text.includes("comparison") || text.includes("head-to-head") || text.includes("head to head")) return "Comparison";
  if (text.includes("buying guide") || text.includes("how to choose") || text.includes("what to look for") || (text.includes("buyer") && text.includes("guide"))) return "Buying Guide";
  if (text.includes("review") || text.includes("we tested") || text.includes("hands on") || text.includes("hands-on") || text.includes("after using") || text.includes("months of")) return "Review";
  if (text.includes("announces") || text.includes("launches") || text.includes("new product") || text.includes("breaking") || text.includes("report:")) return "News";
  return "Editorial";
}

// ─────────────────────────────────────────────────────────
// BRAND MENTION DETECTOR (articles)
// ─────────────────────────────────────────────────────────
function detectBrandMention(brand, title, snippet) {
  const brandLower = brand.toLowerCase();
  const text = `${title} ${snippet}`.toLowerCase();
  const mentioned = text.includes(brandLower);
  let position = null;
  if (mentioned) {
    const posMatch = snippet.match(new RegExp(`#?(\\d+)[^\\w]*${brandLower}|${brandLower}[^\\w]*(?:is|at|ranked|comes in at)?[^\\w]*#?(\\d+)`, "i"));
    if (posMatch) {
      position = parseInt(posMatch[1] || posMatch[2]);
    } else {
      const idx = text.indexOf(brandLower);
      position = idx < 100 ? 1 : idx < 250 ? 2 : idx < 500 ? 3 : 4;
    }
  }
  return { mentioned, position };
}

// ─────────────────────────────────────────────────────────
// DOMAIN TRAFFIC ESTIMATOR
// ─────────────────────────────────────────────────────────
const DOMAIN_TRAFFIC_MAP = {
  "nytimes.com": 85000000, "forbes.com": 60000000, "businessinsider.com": 40000000,
  "buzzfeed.com": 30000000, "cnet.com": 25000000, "theverge.com": 20000000,
  "wired.com": 15000000, "tomsguide.com": 12000000, "pcmag.com": 10000000,
  "reviewed.com": 8000000, "goodhousekeeping.com": 18000000, "realsimple.com": 7000000,
  "apartmenttherapy.com": 9000000, "sleepfoundation.org": 5000000, "sleepopolis.com": 3000000,
  "healthline.com": 35000000, "verywellfit.com": 12000000, "outsideonline.com": 6000000,
  "gearpatrol.com": 2500000, "runnersworld.com": 4000000, "wirecutter.com": 22000000,
  "epicurious.com": 8000000, "bonappetit.com": 10000000, "seriouseats.com": 5000000,
  "foodandwine.com": 6000000, "vogue.com": 20000000, "elle.com": 12000000,
  "instyle.com": 8000000, "gq.com": 9000000, "wsj.com": 30000000,
  "bloomberg.com": 35000000, "reuters.com": 28000000, "bbc.com": 90000000, "cnn.com": 70000000,
  "travelandleisure.com": 8000000, "thespruce.com": 15000000, "bhg.com": 12000000,
  "parents.com": 7000000, "babycenter.com": 6000000, "whattoexpect.com": 5000000,
};

function estimateTraffic(displayLink) {
  const domain = displayLink.replace("www.", "").toLowerCase();
  if (DOMAIN_TRAFFIC_MAP[domain]) return Math.floor(DOMAIN_TRAFFIC_MAP[domain] * (0.001 + Math.random() * 0.018));
  if (domain.endsWith(".org")) return Math.floor(50000 + Math.random() * 500000);
  if (domain.endsWith(".gov")) return Math.floor(100000 + Math.random() * 1000000);
  return Math.floor(10000 + Math.random() * 300000);
}

// ─────────────────────────────────────────────────────────
// PROMPT VOLUME ESTIMATOR
// ─────────────────────────────────────────────────────────
function estimatePromptVolume(query, brand) {
  const q = query.toLowerCase();
  const b = brand.toLowerCase();
  if (/^best .+ of \d{4}/.test(q)) return Math.floor(80000 + Math.random() * 400000);
  if (/^best .+/.test(q) && !q.includes(b)) return Math.floor(50000 + Math.random() * 300000);
  if (/^top \d+ /.test(q)) return Math.floor(40000 + Math.random() * 200000);
  if (q.includes(" vs ") || q.includes(" versus ")) return Math.floor(30000 + Math.random() * 150000);
  if (/^(what|how|why|which|where|when) /.test(q)) return Math.floor(15000 + Math.random() * 100000);
  if (q.includes("alternative") || q.includes("similar to")) return Math.floor(10000 + Math.random() * 80000);
  if (q.includes("review") || q.includes("worth it") || q.includes("worth buying")) return Math.floor(5000 + Math.random() * 50000);
  if (q.includes(b)) return Math.floor(8000 + Math.random() * 60000);
  return Math.floor(10000 + Math.random() * 100000);
}

// ─────────────────────────────────────────────────────────
// TREND GENERATOR
// ─────────────────────────────────────────────────────────
function generateTrend(baseVolume) {
  const months = ["Sep", "Oct", "Nov", "Dec", "Jan", "Feb"];
  return months.map(month => ({
    month,
    volume: Math.floor(baseVolume * (0.7 + Math.random() * 0.6)),
  }));
}

// ─────────────────────────────────────────────────────────
// DATAFORSEO KEYWORD VOLUMES
// ─────────────────────────────────────────────────────────
async function getKeywordVolumes(keywords, login, password) {
  if (!login || !password || !keywords.length) return {};
  try {
    const auth = Buffer.from(`${login}:${password}`).toString("base64");
    const res = await fetch("https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([{
        keywords,
        language_name: "English",
        location_name: "United States",
      }]),
    });
    if (!res.ok) throw new Error(`DataForSEO ${res.status}`);
    const data = await res.json();
    const volumeMap = {};
    for (const item of (data.tasks?.[0]?.result || [])) {
      if (item.keyword && item.search_volume != null) {
        volumeMap[item.keyword.toLowerCase()] = item.search_volume;
      }
    }
    return volumeMap;
  } catch (err) {
    console.warn("DataForSEO error:", err.message);
    return {};
  }
}


// ─────────────────────────────────────────────────────────
// SERPAPI SEARCH
// ─────────────────────────────────────────────────────────
async function searchGoogle(query, apiKey) {
  const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&api_key=${apiKey}&num=10`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SerpAPI error: ${res.status}`);
  }
  const data = await res.json();
  return {
    results: (data.organic_results || []).map(item => {
      let displayLink = item.displayed_link || item.link;
      try { displayLink = new URL(item.link).hostname; } catch (_) {}
      return {
        title: item.title,
        link: item.link,
        displayLink,
        snippet: item.snippet || "",
        pagemap: item.date ? { metatags: [{ "article:published_time": item.date }] } : {},
      };
    }),
    relatedQuestions: (data.related_questions || []).map(q => q.question),
    relatedSearches: (data.related_searches || []).map(s => s.query),
  };
}

// ─────────────────────────────────────────────────────────
// OPENAI QUERY
// ─────────────────────────────────────────────────────────
async function queryOpenAI(prompt, apiKey) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 500,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// ─────────────────────────────────────────────────────────
// DETECT BRAND IN AI RESPONSE
// ─────────────────────────────────────────────────────────
function detectBrandInResponse(brand, responseText) {
  const brandLower = brand.toLowerCase();
  const textLower = responseText.toLowerCase();
  const mentioned = textLower.includes(brandLower);
  let position = null;
  if (mentioned) {
    const numbered = responseText.match(new RegExp(`(\\d+)[.)\\s]+[^\\n]*${brand}`, "i"));
    if (numbered) {
      position = parseInt(numbered[1]);
    } else {
      const idx = textLower.indexOf(brandLower);
      const rel = idx / textLower.length;
      position = rel < 0.15 ? 1 : rel < 0.35 ? 2 : rel < 0.6 ? 3 : 4;
    }
  }
  return { mentioned, position };
}

// ─────────────────────────────────────────────────────────
// ARTICLE SEARCH QUERIES
// ─────────────────────────────────────────────────────────
function buildSearchQueries(brand) {
  return [
    `"${brand}"`,
    `best ${brand} OR "${brand}" review OR "${brand}" recommended`,
    `"${brand}" site:wirecutter.com OR site:goodhousekeeping.com OR site:forbes.com OR site:businessinsider.com OR site:nytimes.com OR site:cnet.com OR site:travelandleisure.com OR site:realsimple.com OR site:thespruce.com OR site:reviewed.com`,
    `${brand} top products ranked OR buying guide`,
  ];
}

// ─────────────────────────────────────────────────────────
// ARTICLES ENDPOINT
// ─────────────────────────────────────────────────────────
app.get("/api/articles", async (req, res) => {
  const { brand } = req.query;
  const apiKey = process.env.SERPAPI_KEY;
  if (!brand) return res.status(400).json({ error: "brand query param required" });
  if (!apiKey) return res.status(500).json({ error: "Search API key not configured" });
  try {
    const queries = buildSearchQueries(brand);
    const allResults = [];
    const seenUrls = new Set();
    for (const query of queries.slice(0, 3)) {
      const { results } = await searchGoogle(query, apiKey);
      for (const item of results) {
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
    allResults.sort((a, b) => b.monthlyTraffic - a.monthlyTraffic);
    res.json({ articles: allResults, brand, total: allResults.length });
  } catch (err) {
    console.error("Articles error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// PROMPTS ENDPOINT — real prompts + real AI engine queries
// ─────────────────────────────────────────────────────────
app.get("/api/prompts", async (req, res) => {
  const { brand } = req.query;
  const serpApiKey = process.env.SERPAPI_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;
  if (!brand) return res.status(400).json({ error: "brand required" });
  if (!serpApiKey) return res.status(500).json({ error: "Search API not configured" });
  try {
    // Step 1: gather real prompts from Google People Also Ask + related searches
    const promptSet = new Set();
    const [r1, r2] = await Promise.allSettled([
      searchGoogle(brand, serpApiKey),
      searchGoogle(`best ${brand} alternatives`, serpApiKey),
    ]);
    for (const r of [r1, r2]) {
      if (r.status !== "fulfilled") continue;
      for (const q of r.value.relatedQuestions) promptSet.add(q);
      for (const s of r.value.relatedSearches.slice(0, 5)) promptSet.add(s);
    }
    // Fill gaps with brand-specific fallbacks
    const fallbacks = [
      `Best ${brand} alternatives`,
      `Is ${brand} worth buying?`,
      `${brand} vs competitors`,
      `${brand} review`,
      `Best products similar to ${brand}`,
      `${brand} pros and cons`,
      `Why is ${brand} popular?`,
      `How does ${brand} compare to other brands?`,
      `Best ${brand} products`,
      `${brand} buying guide`,
    ];
    for (const f of fallbacks) {
      if (promptSet.size >= 10) break;
      promptSet.add(f);
    }
    const promptList = [...promptSet].slice(0, 10);

    // Fetch real keyword volumes from DataForSEO (single batched request)
    const volumeMap = await getKeywordVolumes(promptList, process.env.DATAFORSEO_LOGIN, process.env.DATAFORSEO_PASSWORD);

                // Step 2: query ChatGPT for each prompt sequentially (avoids rate limiting)
            const promptResults = [];
            for (const [i, prompt] of promptList.entries()) {
                        const engines = {};
                        if (openAiKey) {
                                      try {
                                                      const reply = await queryOpenAI(prompt, openAiKey);
                                                      engines["ChatGPT"] = detectBrandInResponse(brand, reply);
                                      } catch (e) {
                                                      console.error("OpenAI error:", e.message);
                                      }
                        }
                        const mentioned = Object.values(engines).some(e => e.mentioned);
                        const position = Object.values(engines).find(e => e.position != null)?.position || null;
                        const mentioningEngines = Object.entries(engines).filter(([, v]) => v.mentioned).map(([k]) => k);
                        const volume = volumeMap[prompt.toLowerCase()] ?? estimatePromptVolume(prompt, brand);
                        promptResults.push({
                                      id: i + 1,
                                      prompt,
                                      monthlyVolume: volume,
                                      mentioned,
                                      position,
                                      engines: mentioningEngines,
                                      trend: generateTrend(volume),
                        });
            }

            const prompts = promptResults
              .sort((a, b) => b.monthlyVolume - a.monthlyVolume)
              .map((p, i) => ({ ...p, id: i + 1 }));
    
    res.json({ prompts, brand, total: prompts.length });
  } catch (err) {
    console.error("Prompts error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────
// TEST OPENAI ENDPOINT (diagnostic)
// ──────────────────────────────────────────────────────
app.get("/api/test-openai", async (req, res) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.json({ ok: false, error: "OPENAI_API_KEY not set" });
    try {
          const result = await queryOpenAI("Say hello in one word.", apiKey);
          res.json({ ok: true, response: result });
    } catch (err) {
          res.json({ ok: false, error: err.message });
    }
});

// ─────────────────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", search: !!process.env.SERPAPI_KEY, openai: !!process.env.OPENAI_API_KEY, dataforseo: !!process.env.DATAFORSEO_LOGIN });
});

app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});
