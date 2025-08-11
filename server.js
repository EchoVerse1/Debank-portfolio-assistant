import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// Your Debank API Key (set in Render environment variables)
const DEBANK_KEY = process.env.DEBANK_KEY;

// Your two Rabby wallet addresses
const wallets = [
  "0x47C7c4E3b59D2C03E98bf54C104e7481474842E5",
  "0x980F71B0D813d6cC81a248e39964c8D1a7BE01E5"
];

// Helper function to fetch from Debank
async function fetchDebank(endpoint, wallet) {
  const url = `https://pro-openapi.debank.com${endpoint}?id=${wallet}`;
  const res = await fetch(url, {
    headers: {
      "accept": "application/json",
      "AccessKey": DEBANK_KEY
    }
  });
  if (!res.ok) {
    throw new Error(`Debank API error: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

app.get("/", async (req, res) => {
  try {
    const results = [];

    for (const wallet of wallets) {
      const totalBalance = await fetchDebank("/v1/user/total_balance", wallet);
      const allTokens = await fetchDebank("/v1/user/all_token_list", wallet);
      const protocols = await fetchDebank("/v1/user/all_simple_protocol_list", wallet);

      results.push({
        wallet,
        totalBalance,
        allTokens,
        protocols
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
