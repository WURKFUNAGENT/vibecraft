import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { registerExactSvmScheme } from "@x402/svm/exact/client";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import bs58 from "bs58";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envContent = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
const vars = {};
envContent.split("\n").forEach((l) => {
  const m = l.match(/^\s*([^#=]+?)\s*=\s*(.*?)\s*$/);
  if (m) vars[m[1]] = m[2];
});

const LIVE_URL = "https://web-production-b9f8a.up.railway.app";

async function main() {
  const signer = await createKeyPairSignerFromBytes(bs58.decode(vars.SOLANA_WALLET_PK));
  console.log(`Wallet: ${signer.address}`);

  const client = new x402Client();
  registerExactSvmScheme(client, {
    signer,
    rpcUrl: `https://mainnet.helius-rpc.com/?api-key=${vars.HELIUS_KEY}`,
  });
  const paymentFetch = wrapFetchWithPayment(fetch, client);

  const description = `Please review VibeCraft v2 — an AI website builder at: ${LIVE_URL}

This is version 2. Changes from v1: Fixed code editor loading (was broken for many users), improved mobile layout, fixed publish URL generation, added error handling.

INSTRUCTIONS:
1. Visit ${LIVE_URL}
2. Type a description of any website you want (e.g. "a portfolio site for a photographer")
3. Try BOTH AI models — GPT-4o and Kimi K2.5
4. Watch the live coding experience
5. Check the live preview
6. Try "Publish" and visit the public URL
7. Try editing with a follow-up prompt

ANSWER ALL (copy format):
- Which AI model produced better results? (GPT-4o / Kimi K2.5 / Same):
- Live coding experience rating (1-10):
- UI design rating (1-10):
- Professional rating (1-10):
- Did publishing work? (yes/no):
- Any bugs or errors?:
- Improvement suggestions:
- Would you pay to use this? (yes/no):`;

  // Try with 10 winners to reduce cost
  const url = "https://wurkapi.fun/solana/agenttohuman?" + new URLSearchParams({
    description,
    winners: "10",
    perUser: "0.05",
  });

  console.log("Creating WURK job (10 winners)...");
  try {
    const res = await paymentFetch(url);
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));

    if (data.secret) {
      console.log(`\nSECRET: ${data.secret}`);
      fs.writeFileSync(
        path.join(__dirname, "wurk-job-v2.json"),
        JSON.stringify({
          secret: data.secret,
          jobId: data.jobId,
          statusUrl: data.statusUrl,
          version: 2,
          createdAt: new Date().toISOString(),
        }, null, 2)
      );
      console.log("Saved to wurk-job-v2.json");
    }
  } catch (e) {
    console.error("Failed:", e.message);
    
    // Try with fewer winners
    console.log("\nRetrying with 5 winners...");
    const url2 = "https://wurkapi.fun/solana/agenttohuman?" + new URLSearchParams({
      description,
      winners: "5",
      perUser: "0.05",
    });
    try {
      const res2 = await paymentFetch(url2);
      const data2 = await res2.json();
      console.log(JSON.stringify(data2, null, 2));
      if (data2.secret) {
        console.log(`\nSECRET: ${data2.secret}`);
        fs.writeFileSync(
          path.join(__dirname, "wurk-job-v2.json"),
          JSON.stringify({
            secret: data2.secret,
            jobId: data2.jobId,
            statusUrl: data2.statusUrl,
            version: 2,
            createdAt: new Date().toISOString(),
          }, null, 2)
        );
      }
    } catch (e2) {
      console.error("Also failed with 5:", e2.message);
    }
  }
}

main().catch(console.error);
