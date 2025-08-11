import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY;
const MORALIS_API = process.env.MORALIS_API;

// Your wallet addresses
const solanaWallets = [
  "4VsCWFtg51VahTDfuZh52Hjkp7RpnWFhfjnhcfFMAjXK", // Example SOL wallet
  // add more Solana wallets here
];

const evmWallets = [
  "0x980F71B0D813d6cC81a248e39964c8D1a7BE01E5", // Example ETH wallet
  "0x47C7c4E3b59D2C03E98bf54C104e7481474842E5", // Example ETH wallet
  // add more EVM wallets here
];

/**
 * Fetch Solana portfolio from Birdeye
 */
async function fetchBirdeyePortfolio(wallet) {
  const url = `https://public-api.birdeye.so/v1/wallet/token_list?wallet=${wallet}&sort_by=usd_value&sort_type=desc&offset=0&limit=50`;

  try {
    const res = await fetch(url, {
      headers: {
        accept: "application/json",
        "x-chain": "solana",
        "X-API-KEY": BIRDEYE_API_KEY
      }
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Birdeye API error: ${res.status} ${errText}`);
    }

    const data = await res.json();
    return data.data?.tokens || [];
  } catch (err) {
    console.error(`[Birdeye ERROR] wallet=${wallet} =>`, err.message);
    return [];
  }
}

/**
 * Fetch EVM portfolio from Moralis
 */
async function fetchMoralisPortfolio(wallet) {
  const chains = ["eth", "bsc", "polygon", "arbitrum", "optimism", "avalanche"];
  let allTokens = [];

  for (const chain of chains) {
    const url = `https://deep-index.moralis.io/api/v2.2/${wallet}/erc20?chain=${chain}`;
    try {
      const res = await fetch(url, {
        headers: {
          accept: "application/json",
          "X-API-Key": MORALIS_API
        }
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Moralis API error (${chain}): ${res.status} ${errText}`);
      }

      const tokens = await res.json();
      if (Array.isArray(tokens)) {
        tokens.forEach(t => t.chain = chain);
        allTokens = allTokens.concat(tokens);
      }
    } catch (err) {
      console.error(`[Moralis ERROR] chain=${chain} wallet=${wallet} =>`, err.message);
    }
  }

  return allTokens;
}

/**
 * API endpoint
 */
app.get("/portfolio", async (req, res) => {
  let portfolio = [];

  // Solana
  for (const wallet of solanaWallets) {
    const solTokens = await fetchBirdeyePortfolio(wallet);
    portfolio.push({ wallet, chain: "solana", tokens: solTokens });
  }

  // EVM
  for (const wallet of evmWallets) {
    const evmTokens = await fetchMoralisPortfolio(wallet);
    portfolio.push({ wallet, chain: "evm", tokens: evmTokens });
  }

  res.json({ success: true, portfolio });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
