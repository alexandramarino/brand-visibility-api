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

// --------------------------------------------------
// NON-EDITORIAL DOMAIN FILTER
// --------------------------------------------------
const NON_EDITORIAL_DOMAINS = new Set([
  // Retailers & e-commerce
  'amazon.com', 'amazon.co.uk', 'amazon.ca', 'amazon.com.au',
  'target.com', 'walmart.com', 'ebay.com', 'etsy.com', 'wayfair.com',
  'sephora.com', 'ulta.com', 'nordstrom.com', 'macys.com',
  'bloomingdales.com', 'kohls.com', 'tjmaxx.com', 'costco.com',
  'cvs.com', 'walgreens.com', 'dermstore.com', 'lookfantastic.com',
  // Social media & video
  'instagram.com', 'facebook.com', 'twitter.com', 'x.com',
  'tiktok.com', 'youtube.com', 'pinterest.com', 'linkedin.com',
  'snapchat.com', 'threads.net',
]);

function isEditorialDomain(displayLink, brand) {
  const domain = displayLink.replace(/^www\./, '').toLowerCase();
  // Block known non-editorial domains
  if (NON_EDITORIAL_DOMAINS.has(domain)) return false;
  // Block the brand's own website (e.g. firstaidbeauty.com for "First Aid Beauty")
  const brandSlug = brand.toLowerCase().replace(/[^a-z0-9]/g, '');
  const domainSlug = domain.replace(/[^a-z0-9.]/g, '');
  if (domainSlug.startsWith(brandSlug) || domainSlug.includes(brandSlug + '.com')) return false;
  return true;
}

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

// --------------------------------------------------
// DATAFORSEO ARTICLE-LEVEL TRAFFIC
// --------------------------------------------------
// CATEGORY COVERAGE ENDPOINT
// --------------------------------------------------
app.get("/api/category-coverage", async (req, res) => {
  const { brand } = req.query;
  const serpApiKey = process.env.SERPAPI_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;
  if (!brand) return res.status(400).json({ error: "brand required" });
  if (!openAiKey) return res.status(500).json({ error: "OpenAI not configured" });

  try {
    // Step 1: AI identifies product categories + top search terms
    // Search Google for brand products to get accurate category context
    let websiteContext = "";
    try {
      // Run two searches: brand name alone + brand on Amazon for product-specific results
      const [brandSearch, amazonSearch] = await Promise.all([
        searchGoogle(brand, serpApiKey),
        searchGoogle(brand + " amazon", serpApiKey)
      ]);
      // Only use top 3 from each to avoid pulling in generic category pages
      const allResults = [
        ...(brandSearch.results || []).slice(0, 3),
        ...(amazonSearch.results || []).slice(0, 3)
      ];
      const snippets = allResults.map(r =>
        (r.title || "") + ": " + (r.snippet || "")
      ).join("\n");
      if (snippets) websiteContext = snippets;
    } catch(e) {
      console.log("Product search failed for", brand, e.message);
    }

    const currentYear = new Date().getFullYear();
    const categoryPrompt = `You are a market research expert. The current year is ${currentYear}. For the brand "${brand}", identify ONLY the specific product categories that ${brand} actually manufactures and sells — based strictly on what appears in the search results below. Do NOT include generic baby product categories (like car seats, clothing, diapers) unless the search results explicitly show ${brand} selling that specific product type.${websiteContext ? "\n\nHere are Google search results for \"" + brand + " products\" — use these to determine their REAL product categories (ignore generic baby product categories that don't appear in these results):\n" + websiteContext : ""} For each category, list the top 3 Google search queries that consumers actually use when researching products in that category in ${currentYear}. Always use ${currentYear} in year-specific search terms (e.g. "best breast pumps ${currentYear}"). Never use years prior to ${currentYear}.

Return ONLY valid JSON, no other text:
{
  "categories": [
    {
      "name": "Category Name",
      "description": "One sentence describing this product category",
      "searchTerms": ["search term 1", "search term 2", "search term 3"]
    }
  ]
}`;

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openAiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: categoryPrompt }], max_tokens: 1000 }),
    });
    if (!aiRes.ok) throw new Error(`OpenAI error: ${aiRes.status}`);
    const aiData = await aiRes.json();
    const aiText = aiData.choices?.[0]?.message?.content || "";

    let parsed;
    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      throw new Error("Failed to parse AI category response");
    }

    // Step 2: Run all SerpAPI searches in parallel
    const cats = (parsed.categories || []).slice(0, 5);
    const searchJobs = [];
    for (const cat of cats) {
      for (const term of (cat.searchTerms || []).slice(0, 3)) {
        searchJobs.push({ catName: cat.name, term });
      }
    }

    const searchResults = await Promise.allSettled(
      searchJobs.map(({ term }) => serpApiKey ? searchGoogle(term, serpApiKey) : Promise.resolve({ results: [] }))
    );

    // Build article map: catName -> term -> articles[]
    const articleMap = {};
    for (let i = 0; i < searchJobs.length; i++) {
      const { catName, term } = searchJobs[i];
      if (!articleMap[catName]) articleMap[catName] = {};
      const r = searchResults[i];
      const items = r.status === "fulfilled" ? (r.value.results || []) : [];
      const seen = new Set();
      const articles = [];
      for (const item of items) {
        if (seen.has(item.link)) continue;
        if (!isEditorialDomain(item.displayLink, brand)) continue;
        seen.add(item.link);
        const { mentioned, position } = detectBrandMention(brand, item.title, item.snippet || "");
        articles.push({
          id: articles.length + 1,
          title: item.title,
          publisher: item.displayLink.replace(/^www\./, ""),
          domain: item.displayLink.replace(/^www\./, ""),
          url: item.link,
          type: classifyArticleType(item.title, item.snippet || "", item.link),
          monthlyTraffic: estimateTraffic(item.displayLink),
          brandMentioned: mentioned,
          mentionPosition: position,
          snippet: item.snippet || "",
          publishDate: item.pagemap?.metatags?.[0]?.["article:published_time"]
            ? new Date(item.pagemap.metatags[0]["article:published_time"]).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
            : "Recent",
          sponsored: false,
          searchTerm: term,
        });
      }
      articleMap[catName][term] = articles;
    }

    // Step 3: Enrich with article-level traffic
    const allArticles = Object.values(articleMap).flatMap(t => Object.values(t).flat());
    const allUrls = allArticles.map(a => a.url);
    const trafficMap = await getArticleTrafficMap(allUrls, process.env.DATAFORSEO_LOGIN, process.env.DATAFORSEO_PASSWORD);
    if (Object.keys(trafficMap).length > 0) {
      for (const a of allArticles) {
        if (trafficMap[a.url] != null) a.monthlyTraffic = trafficMap[a.url];
      }
    }

    // Fetch monthly search volumes for all search terms
    const allTerms = cats.flatMap(cat => (cat.searchTerms || []).slice(0, 3));
    const volumeMap = await getKeywordVolumes(allTerms, process.env.DATAFORSEO_LOGIN, process.env.DATAFORSEO_PASSWORD).catch(() => ({}));

    // Assemble final response
    const categories = cats.map(cat => ({
      name: cat.name,
      description: cat.description || "",
      searchTerms: (cat.searchTerms || []).slice(0, 3).map(term => ({
        term,
        monthlyVolume: volumeMap[term.toLowerCase()] || null,
        articles: articleMap[cat.name]?.[term] || [],
      })),
    }));

    const total = allArticles.length;
    res.json({ brand, categories, total });

  } catch (err) {
    console.error("Category coverage error:", err.message);
    res.status(500).json({ error: err.message });
  }
});


// --------------------------------------------------
async function getArticleTrafficMap(urls, login, password) {
  if (!login || !password || !urls.length) return {};
  try {
    const auth = Buffer.from(`${login}:${password}`).toString("base64");
    const res = await fetch("https://api.dataforseo.com/v3/dataforseo_labs/google/bulk_traffic_estimation/live", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([{
        targets: urls,
        language_code: "en",
        location_code: 2840,
      }]),
    });
    if (!res.ok) throw new Error(`DataForSEO ${res.status}`);
    const data = await res.json();
    const trafficMap = {};
    for (const item of (data.tasks?.[0]?.result?.[0]?.items || [])) {
      const etv = item?.metrics?.organic?.etv;
      if (item.target && etv != null) trafficMap[item.target] = Math.round(etv);
    }
    return trafficMap;
  } catch (err) {
    console.warn("DataForSEO traffic error:", err.message);
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
      if (!isEditorialDomain(item.displayLink, brand)) continue;
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

    // Enrich with article-level traffic from DataForSEO (replaces publisher estimates)
    const articleUrls = allResults.map(a => a.url);
    const trafficMap = await getArticleTrafficMap(articleUrls, process.env.DATAFORSEO_LOGIN, process.env.DATAFORSEO_PASSWORD);
    if (Object.keys(trafficMap).length > 0) {
      for (const article of allResults) {
        if (trafficMap[article.url] != null) article.monthlyTraffic = trafficMap[article.url];
      }
      allResults.sort((a, b) => b.monthlyTraffic - a.monthlyTraffic);
    }
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
