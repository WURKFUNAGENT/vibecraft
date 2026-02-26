import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const secret = "ifCj3bFovljWhQiEOhRETes2";
  const res = await fetch(`https://wurkapi.fun/solana/agenttohuman?action=view&secret=${secret}`);
  const data = await res.json();

  console.log(`Total submissions: ${data.submissions.length}\n`);

  const scores = { live: [], ui: [], pro: [], modelPref: {}, publishOk: 0, publishFail: 0, payYes: 0, payNo: 0, bugs: [], suggestions: [] };

  for (let i = 0; i < data.submissions.length; i++) {
    const text = data.submissions[i].content_text || "";
    console.log(`--- #${i + 1} ---`);
    console.log(text.slice(0, 600));
    console.log();

    // Extract numbers that appear after keywords
    const nums = [];
    const lines = text.split("\n");
    for (const line of lines) {
      const lower = line.toLowerCase();
      // Live coding
      if (lower.includes("live") || lower.includes("coding experience")) {
        const m = line.match(/(\d+)/);
        if (m) { const n = parseInt(m[1]); if (n >= 1 && n <= 10) scores.live.push(n); }
      }
      // UI
      if (lower.includes("ui") || lower.includes("design rating")) {
        const m = line.match(/(\d+)/);
        if (m) { const n = parseInt(m[1]); if (n >= 1 && n <= 10) scores.ui.push(n); }
      }
      // Professional
      if (lower.includes("professional") || lower.includes("enterprise")) {
        const m = line.match(/(\d+)/);
        if (m) { const n = parseInt(m[1]); if (n >= 1 && n <= 10) scores.pro.push(n); }
      }
      // Model
      if (lower.includes("model") || lower.includes("better result")) {
        if (/gpt/i.test(line) && !/kimi/i.test(line)) scores.modelPref.gpt4o = (scores.modelPref.gpt4o || 0) + 1;
        else if (/kimi/i.test(line) && !/gpt/i.test(line)) scores.modelPref.kimi = (scores.modelPref.kimi || 0) + 1;
        else if (/same|both|equal/i.test(line)) scores.modelPref.same = (scores.modelPref.same || 0) + 1;
      }
      // Publishing
      if (lower.includes("publish")) {
        if (/yes/i.test(line)) scores.publishOk++;
        else if (/no/i.test(line)) scores.publishFail++;
      }
      // Pay
      if (lower.includes("pay") || lower.includes("would you")) {
        if (/yes/i.test(line)) scores.payYes++;
        else if (/no/i.test(line)) scores.payNo++;
      }
      // Bugs
      if (lower.includes("bug") || lower.includes("error")) {
        const content = line.replace(/.*?[:]/,'').trim();
        if (content.length > 3 && !/none|no\b/i.test(content)) scores.bugs.push(content);
      }
      // Suggestions
      if (lower.includes("suggest") || lower.includes("improv")) {
        const content = line.replace(/.*?[:]/,'').trim();
        if (content.length > 5) scores.suggestions.push(content);
      }
    }
  }

  const avg = (arr) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : "N/A";

  console.log("\n" + "=".repeat(60));
  console.log("V2 FEEDBACK ANALYSIS");
  console.log("=".repeat(60));
  console.log(`\nLive Coding: ${avg(scores.live)}/10 (n=${scores.live.length}) [${scores.live.join(", ")}]`);
  console.log(`UI Design: ${avg(scores.ui)}/10 (n=${scores.ui.length}) [${scores.ui.join(", ")}]`);
  console.log(`Professional: ${avg(scores.pro)}/10 (n=${scores.pro.length}) [${scores.pro.join(", ")}]`);
  console.log(`\nModel: GPT-4o=${scores.modelPref.gpt4o||0} Kimi=${scores.modelPref.kimi||0} Same=${scores.modelPref.same||0}`);
  console.log(`Publishing: OK=${scores.publishOk} Fail=${scores.publishFail}`);
  const total = scores.payYes + scores.payNo;
  console.log(`Would pay: Yes=${scores.payYes} No=${scores.payNo} (${total > 0 ? Math.round(scores.payYes/total*100) : "N/A"}%)`);
  console.log(`\nBugs (${scores.bugs.length}):`);
  scores.bugs.forEach(b => console.log(`  - ${b}`));
  console.log(`\nSuggestions (${scores.suggestions.length}):`);
  scores.suggestions.forEach(s => console.log(`  - ${s}`));

  // Check conditions
  console.log("\n--- TARGET CHECK ---");
  const liveAvg = scores.live.length ? scores.live.reduce((a,b)=>a+b)/scores.live.length : 0;
  const uiAvg = scores.ui.length ? scores.ui.reduce((a,b)=>a+b)/scores.ui.length : 0;
  const proAvg = scores.pro.length ? scores.pro.reduce((a,b)=>a+b)/scores.pro.length : 0;
  const payPct = total > 0 ? scores.payYes/total : 0;
  console.log(`Live coding >= 8: ${liveAvg >= 8 ? "PASS" : "FAIL"} (${liveAvg.toFixed(1)})`);
  console.log(`UI design >= 8: ${uiAvg >= 8 ? "PASS" : "FAIL"} (${uiAvg.toFixed(1)})`);
  console.log(`Professional >= 8: ${proAvg >= 8 ? "PASS" : "FAIL"} (${proAvg.toFixed(1)})`);
  console.log(`No critical bugs: ${scores.bugs.length === 0 ? "PASS" : "FAIL"}`);
  console.log(`Pay > 70%: ${payPct > 0.7 ? "PASS" : "FAIL"} (${Math.round(payPct*100)}%)`);

  fs.writeFileSync(path.join(__dirname, "feedback-v2.json"), JSON.stringify({ submissions: data.submissions, scores }, null, 2));
  console.log("\nSaved to feedback-v2.json");
}

main().catch(console.error);
