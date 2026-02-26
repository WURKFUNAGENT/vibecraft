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
const VERSION = process.argv[2] || "1";
const IMPROVEMENTS = process.argv[3] || "";

async function main() {
  const signer = await createKeyPairSignerFromBytes(bs58.decode(vars.SOLANA_WALLET_PK));
  console.log(`Wallet: ${signer.address}`);

  const client = new x402Client();
  registerExactSvmScheme(client, {
    signer,
    rpcUrl: `https://mainnet.helius-rpc.com/?api-key=${vars.HELIUS_KEY}`,
  });
  const paymentFetch = wrapFetchWithPayment(fetch, client);

  let description = `Please review VibeCraft (v${VERSION}) — an AI website builder at: ${LIVE_URL}

${IMPROVEMENTS ? `This is version ${VERSION}. Changes: ${IMPROVEMENTS}\n\n` : ""}INSTRUCTIONS:
1. Visit ${LIVE_URL}
2. In the left panel, type a description of any website you want (e.g. "a portfolio site for a photographer" or "a landing page for a pizza restaurant")
3. Try BOTH AI models — first use GPT-4o, then use Kimi K2.5. Note which one produced better results.
4. Watch the live coding experience as AI writes code character by character
5. Check the live preview on the right side — does it look good?
6. Try clicking "Publish" and visit the public URL it gives you
7. Try editing the prompt to ask for changes (e.g. "make the background darker")

PLEASE ANSWER ALL OF THESE (copy the format):
- Which AI model produced better results? (GPT-4o / Kimi K2.5 / About the same)
- Live coding experience rating (1-10, where 10 = amazing):
- UI design rating (1-10, where 10 = beautiful):
- Professional/enterprise-worthy rating (1-10, where 10 = very professional):
- Did publishing work? (yes/no):
- Any bugs or errors? (describe or "none"):
- Improvement suggestions:
- Would you pay to use this tool? (yes/no):`;

  const url = "https://wurkapi.fun/solana/agenttohuman?" + new URLSearchParams({
    description,
    winners: "20",
    perUser: "0.05",
  });

  console.log("Creating WURK job...");
  const res = await paymentFetch(url);
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));

  if (data.secret) {
    console.log(`\n=== SAVE THIS ===`);
    console.log(`SECRET: ${data.secret}`);
    console.log(`JOB_ID: ${data.jobId}`);
    console.log(`STATUS_URL: ${data.statusUrl}`);

    fs.writeFileSync(
      path.join(__dirname, "wurk-job.json"),
      JSON.stringify({
        secret: data.secret,
        jobId: data.jobId,
        statusUrl: data.statusUrl,
        jobLink: data.jobLink,
        version: parseInt(VERSION),
        createdAt: new Date().toISOString(),
      }, null, 2)
    );
    console.log("Saved to wurk-job.json");
  }
}

main().catch(console.error);
