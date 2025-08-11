import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// Your Rabby wallet addresses
const wallets = [
  "0x47C7c4E3b59D2C03E98bf54C104e7481474842E5",
  "0x980F71B0D813d6cC81a248e39964c8D1a7BE01E5"
];

// List of chains to check (add/remove as needed)
const chains = [
  "eth", "bsc", "matic", "arb", "op", "avax", "ftm"
];

// Helper function to fetch from Debank Free API
async function fetchDebankFree(endpoint) {
  const url = `https://api.debank.com${endpoint}`;
  const res = await fetch(url, { headers: { "accept": "application/json" } });
  if (!res.ok) {
    throw new Error(`Debank API error: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

app.get("/", async (req, res) => {
  try {
    const results = [];

    for (const wallet of wallets) {
      let walletData = { wallet, chains: [], totalUsdValue: 0 };

      for (const chain of chains) {
        const tokens = await fetchDebankFree(`/v1/user/token_list?id=${wallet}&chain_id=${chain}`);

        let chainUsdValue = 0;
        if (tokens?.data) {
          for (const token of tokens.data) {
            chainUsdValue += (token.price || 0) * (token.amount || 0);
          }
        }

        walletData.totalUsdValue += chainUsdValue;

        walletData.chains.push({
          chain,
          tokenCount: tokens?.data?.length || 0,
          usdValue: chainUsdValue,
          tokens: tokens?.data || []
        });
      }

      results.push(walletData);
    }

    res.json({ wallets: results });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
