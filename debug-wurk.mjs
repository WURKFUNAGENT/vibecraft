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

async function main() {
  console.log("Step 1: Create signer...");
  const secretKeyBytes = bs58.decode(vars.SOLANA_WALLET_PK);
  console.log("  Key bytes length:", secretKeyBytes.length);
  
  const signer = await createKeyPairSignerFromBytes(secretKeyBytes);
  console.log("  Wallet:", signer.address);

  console.log("Step 2: Setup x402 client...");
  const client = new x402Client();
  registerExactSvmScheme(client, {
    signer,
    rpcUrl: `https://mainnet.helius-rpc.com/?api-key=${vars.HELIUS_KEY}`,
  });
  const paymentFetch = wrapFetchWithPayment(fetch, client);

  console.log("Step 3: Try minimal job...");
  const url = "https://wurkapi.fun/solana/agenttohuman?" + new URLSearchParams({
    description: "Test: which color do you prefer, blue or red? Just say blue or red.",
    winners: "1",
    perUser: "0.01",
  });

  console.log("  URL:", url);
  
  // First, try without payment to see the 402 response
  console.log("\nStep 3a: Checking 402 response...");
  const raw = await fetch(url);
  console.log("  Status:", raw.status);
  const rawData = await raw.json();
  console.log("  402 data:", JSON.stringify(rawData, null, 2).slice(0, 500));

  // Then try with payment
  console.log("\nStep 3b: Trying with payment...");
  try {
    const res = await paymentFetch(url);
    const data = await res.json();
    console.log("  Success:", JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("  Error:", e.message);
    console.error("  Stack:", e.stack?.split("\n").slice(0, 5).join("\n"));
  }
}

main().catch(console.error);
