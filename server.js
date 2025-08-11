import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// === CONFIG ===
// Moralis API key (EVM chains)
const MORALIS_KEY = process.env.MORALIS_KEY; // put in Render env vars
// Birdeye API key (Solana)
const BIRDEYE_KEY = process.env.BIRDEYE_KEY; // put in Render env vars

// Wallet addresses
const EVM_WALLETS = [
  "0x47C7c4E3b59D2C03E98bf54C104e7481474842E5",
  "0x980F71B0D813d6cC81a248e39964c8D1a7BE01E5"
];
const SOL_WALLETS = [
  "4VsCWFtg51VahTDfuZh52Hjkp7RpnWFhfjnhcfFMAjXK",
  "INSERT_SOLANA_WALLET_2"
];

// EVM chains to track
const CHAINS = [
  { id: "eth", hex: "0x1" },
  { id: "bsc", hex: "0x38" },
  { id: "matic", hex: "0x89" },
  { id: "arb", hex: "0xa4b1" },
  { id: "op", hex: "0xa" },
  { id: "avax", hex: "0xa86a" },
  { id: "ftm", hex: "0xfa" }
];

// === HELPERS ===
async function httpGetJson(url, headers = {}, tries = 2) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { accept: "application/json", ...headers } });
    if (res.ok) return res.json();
    lastErr = new Error(`HTTP ${res.status} ${await res.text()}`);
    if (res.status >= 500 && res.status <= 599) continue; // retry only on 5xx
    break;
  }
  throw lastErr;
}

function sumUsd(tokens) {
  return tokens.reduce((acc, t) => {
    const px = Number(t.price_usd || t.usdPrice || 0);
    const amt = Number(t.amount || t.balance || 0);
    if (px > 0 && amt !== 0) acc += px * amt;
    return acc;
  }, 0);
}

function flattenHoldings(tokens, chainId, wallet) {
  return tokens.map(t => ({
    wallet,
    chain: chainId,
    token_id: t.token_address || t.address || "",
    symbol: t.symbol || "",
    name: t.name || "",
    decimals: t.decimals ?? null,
    price_usd: Number(t.price_usd || t.usdPrice || 0),
    amount: Number(t.amount || t.balance || 0),
    value_usd: Number(t.price_usd || t.usdPrice || 0) * Number(t.amount || t.balance || 0),
    logo_url: t.logo || t.logo_url || null
  }));
}

// === DATA FETCHERS ===

// Moralis EVM token balances
async function getEvmTokens(chainHex, address) {
  const url = `https://deep-index.moralis.io/api/v2.2/${address}/erc20?chain=${chainHex}`;
  const data = await httpGetJson(url, { "X-API-Key": MORALIS_KEY });
  return (data || []).map(t => ({
    token_address: t.token_address,
    symbol: t.symbol,
    name: t.name,
    decimals: t.decimals,
    price_usd: t.usdPrice,
    amount: Number(t.balance) / Math.pow(10, t.decimals),
    logo_url: t.logo
  }));
}

// Birdeye Solana token balances
async function getSolTokens(address) {
  const url = `https://public-api.birdeye.so/v1/wallet/token_list?wallet=${address}`;
  const data = await httpGetJson(url, { "x-api-key": BIRDEYE_KEY });
  return (data?.data?.tokens || []).map(t => ({
    token_address: t.address,
    symbol: t.symbol,
    name: t.name,
    decimals: t.decimals,
    price_usd: t.price,
    amount: t.amount,
    logo_url: t.logoURI
  }));
}

// === ROUTES ===
app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/holdings", async (_req, res) => {
  try {
    const walletsOut = [];

    // EVM wallets
    for (const wallet of EVM_WALLETS) {
      const chainsOut = [];
      const flatRows = [];
      let walletTotal = 0;

      for (const chain of CHAINS) {
        const tokens = await getEvmTokens(chain.hex, wallet);
        const chainTotal = sumUsd(tokens);
        walletTotal += chainTotal;

        chainsOut.push({ chain: chain.id, token_count: tokens.length, usd_value: chainTotal, tokens });
        flatRows.push(...flattenHoldings(tokens, chain.id, wallet));
      }

      walletsOut.push({
        wallet,
        total_usd_value: walletTotal,
        chains: chainsOut,
        tokens_flat: flatRows.sort((a, b) => b.value_usd - a.value_usd)
      });
    }

    // Solana wallets
    for (const wallet of SOL_WALLETS) {
      const tokens = await getSolTokens(wallet);
      const totalValue = sumUsd(tokens);

      walletsOut.push({
        wallet,
        total_usd_value: totalValue,
        chains: [{ chain: "sol", token_count: tokens.length, usd_value: totalValue, tokens }],
        tokens_flat: flattenHoldings(tokens, "sol", wallet).sort((a, b) => b.value_usd - a.value_usd)
      });
    }

    // Combined view
    const combinedTokens = walletsOut.flatMap(w => w.tokens_flat);
    const merged = {};
    for (const r of combinedTokens) {
      const k = r.token_id;
      if (!merged[k]) {
        merged[k] = { ...r, amount: 0, value_usd: 0, occurrences: 0 };
      }
      merged[k].amount += r.amount;
      merged[k].value_usd += r.value_usd;
      merged[k].occurrences += 1;
    }

    res.json({
      updated_at: new Date().toISOString(),
      wallets: walletsOut,
      portfolio_topline: Object.values(merged).sort((a, b) => b.value_usd - a.value_usd)
    });
  } catch (e) {
    console.error(`[holdings ERROR] ${e.message}\n${e.stack}`);
    res.status(500).json({ error: "failed_to_build_holdings" });
  }
});

app.get("/", (_req, res) => res.redirect(302, "/holdings"));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
