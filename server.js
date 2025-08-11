import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// Your Moralis API key from Render environment variables
const MORALIS_API = process.env.MORALIS_API;

// List of wallets to track
const wallets = [
  "0x47C7c4E3b59D2C03E98bf54C104e7481474842E5",
  "0x980F71B0D813d6cC81a248e39964c8D1a7BE01E5"
];

// Chains you want to check (EVM only for now)
const chains = [
  "eth",    // Ethereum
  "bsc",    // Binance Smart Chain
  "polygon",// Polygon
  "avax",   // Avalanche
  "fantom", // Fantom
  "arbitrum",// Arbitrum
  "optimism"// Optimism
];

// Fetch token balances for a wallet on a specific chain
async function fetchBalances(chain, wallet) {
  try {
    const url = `https://deep-index.moralis.io/api/v2.2/${wallet}/erc20?chain=${chain}`;
    const res = await fetch(url, {
      headers: {
        accept: "application/json",
        "X-API-Key": MORALIS_API
      }
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`HTTP ${res.status} ${errorText}`);
    }

    const data = await res.json();
    return data.map(token => ({
      chain,
      wallet,
      symbol: token.symbol,
      name: token.name,
      balance: token.balance / (10 ** token.decimals),
      usdValue: token.usd_value || 0
    }));
  } catch (error) {
    console.error(`[Moralis ERROR] chain=${chain} wallet=${wallet} =>`, error.message);
    return [];
  }
}

// Route to view portfolio
app.get("/portfolio", async (req, res) => {
  const portfolio = [];

  for (const wallet of wallets) {
    for (const chain of chains) {
      const balances = await fetchBalances(chain, wallet);
      portfolio.push(...balances);
    }
  }

  res.json(portfolio);
});

app.get("/", (req, res) => {
  res.send("Crypto Portfolio Tracker is live 🚀");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
