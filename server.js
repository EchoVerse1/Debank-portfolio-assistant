import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// Your wallet addresses
const wallets = [
  "0x47C7c4E3b59D2C03E98bf54C104e7481474842E5",
  "0x980F71B0D813d6cC81a248e39964c8D1a7BE01E5"
];

// Helper function for free Debank API
async function fetchDebankFree(endpoint) {
  const url = `https://api.debank.com${endpoint}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Debank API error: ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  return body?.data ?? [];
}

app.get("/", async (req, res) => {
  try {
    const results = [];

    for (const wallet of wallets) {
      const tokens = await fetchDebankFree(`/v1/user/all_token_list?id=${wallet}`);

      // Group tokens by chain
      const chainMap = {};
      let totalUsdValue = 0;

      for (const token of tokens) {
        const chain = token.chain || "unknown";
        const price = token.price || 0;
        const amount = token.amount || 0;
        const usdValue = price * amount;

        totalUsdValue += usdValue;

        if (!chainMap[chain]) {
          chainMap[chain] = { chain, tokenCount: 0, usdValue: 0, tokens: [] };
        }

        chainMap[chain].tokenCount++;
        chainMap[chain].usdValue += usdValue;
        chainMap[chain].tokens.push(token);
      }

      results.push({
        wallet,
        totalUsdValue: Number(totalUsdValue.toFixed(2)),
        chains: Object.values(chainMap).map(c => ({
          ...c,
          usdValue: Number(c.usdValue.toFixed(2))
        }))
      });
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
