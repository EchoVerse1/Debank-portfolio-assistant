// server.js
import express from "express";
import fetch from "node-fetch";

const app = express();

// Render sets PORT for you
const PORT = process.env.PORT || 3000;

// Your Rabby wallets
const wallets = [
  "0x47C7c4E3b59D2C03E98bf54C104e7481474842E5",
  "0x980F71B0D813d6cC81a248e39964c8D1a7BE01E5"
];

// Debank FREE base (no AccessKey needed)
const DEBANK_FREE_BASE = "https://openapi.debank.com";

// Track the chains you care about (adjust anytime)
const CHAINS = ["eth", "bsc", "matic", "arb", "op", "avax", "ftm"];

// Minimal retry helper for flaky 5xx
async function httpGetJson(url, headers = {}, tries = 2) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { accept: "application/json", ...headers } });
    if (res.ok) return res.json();
    lastErr = new Error(`HTTP ${res.status} ${await res.text()}`);
    // Retry only on 5xx
    if (res.status >= 500 && res.status <= 599) continue;
    break;
  }
  throw lastErr;
}

// Debank free: per-chain token list
async function getTokenList(chainId, address) {
  const url = `${DEBANK_FREE_BASE}/v1/user/token_list?id=${address}&chain_id=${chainId}`;
  try {
    const json = await httpGetJson(url);
    // Free API usually returns { "data": [ ...tokens ] }
    return json?.data ?? [];
  } catch (e) {
    // Make failures obvious in Render logs
    console.error(`[token_list ERROR] chain=${chainId} addr=${address} url=${url}\n${e?.message}`);
    return []; // fail-soft so one chain doesn’t kill the whole response
  }
}

// Price * amount sum helper (guards against 0/undefined)
function sumUsd(tokens) {
  let total = 0;
  for (const t of tokens) {
    const px = Number(t?.price || 0);
    const amt = Number(t?.amount || 0);
    if (px > 0 && amt !== 0) total += px * amt;
  }
  return total;
}

// Flatten per-token rows so you can make rotation decisions easily
function flattenHoldings(tokens, chainId, wallet) {
  return tokens.map(t => ({
    wallet,
    chain: chainId,
    token_id: t.id,
    symbol: t.optimized_symbol || t.display_symbol || t.symbol || "",
    name: t.name || "",
    decimals: t.decimals ?? null,
    price_usd: Number(t.price || 0),
    amount: Number(t.amount || 0),
    value_usd: Number(t.price || 0) * Number(t.amount || 0),
    is_core: !!t.is_core,
    is_verified: !!t.is_verified,
    logo_url: t.logo_url || null,
  }));
}

// Health
app.get("/health", (_req, res) => res.json({ ok: true }));

// Main endpoint: all wallets → per-chain tokens → flattened + totals
app.get("/holdings", async (_req, res) => {
  try {
    const walletsOut = [];

    for (const wallet of wallets) {
      const chainsOut = [];
      const flatRows = [];
      let walletTotal = 0;

      for (const chain of CHAINS) {
        const tokens = await getTokenList(chain, wallet);
        const chainTotal = sumUsd(tokens);
        walletTotal += chainTotal;

        chainsOut.push({
          chain,
          token_count: tokens.length,
          usd_value: chainTotal,
          tokens // raw token objects from Debank free
        });

        flatRows.push(...flattenHoldings(tokens, chain, wallet));
      }

      // group-by token across chains for “rotation decisions” convenience
      const perToken = {};
      for (const row of flatRows) {
        const key = `${row.wallet}|${row.token_id}`;
        if (!perToken[key]) {
          perToken[key] = { ...row };
        } else {
          perToken[key].amount += row.amount;
          perToken[key].value_usd += row.value_usd;
        }
      }

      walletsOut.push({
        wallet,
        total_usd_value: walletTotal,
        chains: chainsOut,
        // a tidy list you can sort by value to rotate out of dust / illiquid
        tokens_flat: Object.values(perToken).sort((a, b) => b.value_usd - a.value_usd)
      });
    }

    // Combined view across both wallets (handy for top-N by USD)
    const combinedTokens = [];
    for (const w of walletsOut) combinedTokens.push(...w.tokens_flat);
    // Merge same token across both wallets
    const merged = {};
    for (const r of combinedTokens) {
      const k = r.token_id; // combine across wallets intentionally
      if (!merged[k]) {
        merged[k] = {
          token_id: r.token_id,
          symbol: r.symbol,
          name: r.name,
          decimals: r.decimals,
          logo_url: r.logo_url,
          price_usd: r.price_usd,
          amount: 0,
          value_usd: 0,
          occurrences: 0
        };
      }
      merged[k].amount += r.amount;
      merged[k].value_usd += r.value_usd;
      merged[k].occurrences += 1;
    }
    const portfolioTopline = Object.values(merged).sort((a, b) => b.value_usd - a.value_usd);

    res.json({
      updated_at: new Date().toISOString(),
      wallets: walletsOut,
      portfolio_topline: portfolioTopline // best list to drive rotations
    });
  } catch (e) {
    console.error(`[holdings ERROR] ${e?.message}\n${e?.stack}`);
    res.status(500).json({ error: "failed_to_build_holdings" });
  }
});

// Root: nudge to /holdings
app.get("/", (_req, res) => res.redirect(302, "/holdings"));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
