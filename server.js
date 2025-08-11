import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// Defaults (your two Rabby wallets)
const DEFAULT_WALLETS = [
  "0x47C7c4E3b59D2C03E98bf54C104e7481474842E5",
  "0x980F71B0D813d6cC81a248e39964c8D1a7BE01E5"
];

// Reasonable default chain list for Debank Free
const DEFAULT_CHAINS = ["eth", "bsc", "matic", "arb", "op", "avax", "ftm"];

// super-light cache (60s) to avoid hammering free API
const cache = new Map();
const CACHE_TTL_MS = 60_000;

function parseListParam(val, fallback) {
  if (!val) return fallback;
  if (Array.isArray(val)) return val;
  return String(val)
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

async function fetchDebankFree(endpoint) {
  const url = `https://api.debank.com${endpoint}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Debank API error: ${res.status} ${await res.text()}`);
  const body = await res.json();
  // Debank free usually returns { code: 0, data: [...] }
  if (body?.code !== 0 && body?.data === undefined) {
    throw new Error(`Unexpected Debank response: ${JSON.stringify(body).slice(0, 200)}…`);
  }
  return body?.data ?? body;
}

function tokensArray(maybe) {
  // Be tolerant: some endpoints return { list: [...] } or { data: [...] } or [...]
  if (Array.isArray(maybe)) return maybe;
  if (Array.isArray(maybe?.list)) return maybe.list;
  if (Array.isArray(maybe?.data)) return maybe.data;
  return [];
}

async function getWalletSnapshot(wallet, chains, includeTokens) {
  let totalUsdValue = 0;
  const chainResults = [];

  for (const chain of chains) {
    const data = await fetchDebankFree(`/v1/user/token_list?id=${wallet}&chain_id=${chain}`);
    const toks = tokensArray(data);

    let chainUsd = 0;
    for (const t of toks) {
      const price = Number(t?.price || 0);
      const amount = Number(t?.amount || 0);
      if (price && amount) chainUsd += price * amount;
    }

    totalUsdValue += chainUsd;

    chainResults.push({
      chain,
      usdValue: Number(chainUsd.toFixed(2)),
      tokenCount: toks.length,
      ...(includeTokens ? { tokens: toks } : {})
    });
  }

  return {
    wallet,
    totalUsdValue: Number(totalUsdValue.toFixed(2)),
    chains: chainResults
  };
}

// Root → convenience: same as /portfolio with defaults
app.get("/", async (req, res) => {
  res.redirect(302, "/portfolio");
});

/**
 * GET /portfolio
 * Query:
 *   wallets=0xabc,0xdef   (optional; defaults to your two Rabby)
 *   chains=eth,arb,op     (optional; defaults to DEFAULT_CHAINS)
 *   includeTokens=true     (optional; false trims payload to just totals)
 */
app.get("/portfolio", async (req, res) => {
  try {
    const wallets = parseListParam(req.query.wallets, DEFAULT_WALLETS);
    const chains = parseListParam(req.query.chains, DEFAULT_CHAINS);
    const includeTokens = String(req.query.includeTokens || "false").toLowerCase() === "true";

    // cache key by inputs + includeTokens flag
    const key = JSON.stringify({ wallets, chains, includeTokens });
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && now - hit.t < CACHE_TTL_MS) {
      return res.json(hit.v);
    }

    const snapshots = [];
    for (const w of wallets) {
      snapshots.push(await getWalletSnapshot(w, chains, includeTokens));
    }

    const payload = {
      updated: new Date().toISOString(),
      wallets: snapshots
    };

    cache.set(key, { t: now, v: payload });
    res.set("Cache-Control", "no-store");
    res.json(payload);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
