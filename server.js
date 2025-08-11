// server.js
import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// === CONFIG ===

// Your wallets
const evmWallets = [
  "0x47C7c4E3b59D2C03E98bf54C104e7481474842E5",
  "0x980F71B0D813d6cC81a248e39964c8D1a7BE01E5"
];
const solWallets = [
  "INSERT_SOLANA_WALLET_1",
  "INSERT_SOLANA_WALLET_2"
];

// Chains to track on Debank free
const CHAINS = ["eth", "bsc", "matic", "arb", "op", "avax", "ftm"];
const DEBANK_FREE_BASE = "https://openapi.debank.com";

// Birdeye API key (set in Render env vars as BIRDEYE_KEY)
const BIRDEYE_KEY = process.env.BIRDEYE_KEY;

// === HELPERS ===
async function httpGetJson(url, headers = {}, tries = 2) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { accept: "application/json", ...headers } });
    if (res.ok) return res.json();
    lastErr = new Error(`HTTP ${res.status} ${await res.text()}`);
    if (res.status >= 500 && res.status <= 599) continue;
    break;
  }
  throw lastErr;
}

// Debank free: per-chain token list
async function getDebankTokens(chainId, address) {
  const url = `${DEBANK_FREE_BASE}/v1/user/token_list?id=${address}&chain_id=${chainId}`;
  try {
    const json = await httpGetJson(url);
    return json?.data ?? [];
  } catch (e) {
    console.error(`[Debank ERROR] chain=${chainId} wallet=${address} => ${e.message}`);
    return [];
  }
}

// Birdeye: Solana token balances
async function getBirdeyeTokens(address) {
  try {
    const url = `https://public-api.birdeye.so/v1/wallet/token_list?wallet=${address}`;
    const json = await httpGetJson(url, { "X-API-KEY": BIRDEYE_KEY });
    return json?.data?.tokens ?? [];
  } catch (e) {
    console.error(`[Birdeye ERROR] wallet=${address} => ${e.message}`);
    return [];
  }
}

// Sum USD
function sumUsd(tokens, priceKey = "price", amountKey = "amount") {
  return tokens.reduce((sum, t) => {
    const px = Number(t?.[priceKey] || 0);
    const amt = Number(t?.[amountKey] || 0);
    return sum + (px > 0 && amt !== 0 ? px * amt : 0);
  }, 0);
}

// Normalize to common format
function normalizeEvmTokens(tokens, chain, wallet) {
  return tokens.map(t => ({
    wallet,
    chain,
    token_id: t.id,
    symbol: t.optimized_symbol || t.display_symbol || t.symbol || "",
    name: t.name || "",
    price_usd: Number(t.price || 0),
    amount: Number(t.amount || 0),
    value_usd: Number(t.price || 0) * Number(t.amount || 0),
    logo_url: t.logo_url || null
  }));
}

function normalizeSolTokens(tokens, wallet) {
  return tokens.map(t => ({
    wallet,
    chain: "sol",
    token_id: t.address,
    symbol: t.symbol || "",
    name: t.name || "",
    price_usd: Number(t.price || 0),
    amount: Number(t.uiAmount || 0),
    value_usd: Number(t.price || 0) * Number(t.uiAmount || 0),
    logo_url: t.logoURI || null
  }));
}

// === ROUTES ===
app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/holdings", async (_req, res) => {
  try {
    const walletsOut = [];

    // --- EVM wallets ---
    for (const wallet of evmWallets) {
      const chainsOut = [];
      let flatRows = [];
      let walletTotal = 0;

      for (const chain of CHAINS) {
        const tokens = await getDebankTokens(chain, wallet);
        const chainTotal = sumUsd(tokens);
        walletTotal += chainTotal;
        chainsOut.push({ chain, token_count: tokens.length, usd_value: chainTotal, tokens });
        flatRows.push(...normalizeEvmTokens(tokens, chain, wallet));
      }

      walletsOut.push({ wallet, total_usd_value: walletTotal, chains: chainsOut, tokens_flat: flatRows });
    }

    // --- Solana wallets ---
    for (const wallet of solWallets) {
      const tokens = await getBirdeyeTokens(wallet);
      const walletTotal = sumUsd(tokens, "price", "uiAmount");
      const chainsOut = [{ chain: "sol", token_count: tokens.length, usd_value: walletTotal, tokens }];
      const flatRows = normalizeSolTokens(tokens, wallet);
      walletsOut.push({ wallet, total_usd_value: walletTotal, chains: chainsOut, tokens_flat: flatRows });
    }

    // --- Combine for topline view ---
    const combinedTokens = [];
    for (const w of walletsOut) combinedTokens.push(...w.tokens_flat);

    const merged = {};
    for (const r of combinedTokens) {
      const k = `${r.chain}|${r.token_id}`;
      if (!merged[k]) {
        merged[k] = { ...r, occurrences: 0 };
      }
      merged[k].amount += r.amount;
      merged[k].value_usd += r.value_usd;
      merged[k].occurrences += 1;
    }
    const portfolioTopline = Object.values(merged).sort((a, b) => b.value_usd - a.value_usd);

    res.json({ updated_at: new Date().toISOString(), wallets: walletsOut, portfolio_topline: portfolioTopline });
  } catch (e) {
    console.error(`[holdings ERROR] ${e.message}\n${e.stack}`);
    res.status(500).json({ error: "failed_to_build_holdings" });
  }
});

app.get("/", (_req, res) => res.redirect(302, "/holdings"));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
