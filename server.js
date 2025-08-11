// server.js
import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const DEBANK_BASE = "https://pro-openapi.debank.com/v1/user";

// Fetch helper
async function fetchDebank(endpoint, address) {
  const res = await fetch(`${DEBANK_BASE}/${endpoint}?id=${address}`, {
    headers: {
      accept: "application/json",
      AccessKey: process.env.DEBANK_KEY
    }
  });
  if (!res.ok) throw new Error(`Debank API error: ${res.status}`);
  return res.json();
}

// Combined endpoint
app.get("/portfolio/:address", async (req, res) => {
  try {
    const address = req.params.address;

    // Get total balance & all tokens
    const [totalBalance, allTokens] = await Promise.all([
      fetchDebank("total_balance", address),
      fetch(`${DEBANK_BASE}/all_token_list?id=${address}`, {
        headers: {
          accept: "application/json",
          AccessKey: process.env.DEBANK_KEY
        }
      }).then(r => r.json())
    ]);

    res.json({
      total_balance: totalBalance,
      tokens: allTokens
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
