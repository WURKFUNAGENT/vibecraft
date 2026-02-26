async function main() {
  const res = await fetch("https://wurkapi.fun/solana/agenttohuman?action=view&secret=7I346lqbisPnGgBGRK8Bm8fB");
  const data = await res.json();
  console.log(`Total submissions: ${data.submissions.length}\n`);

  for (let i = 0; i < data.submissions.length; i++) {
    const text = data.submissions[i].content_text || "";
    console.log(`--- #${i+1} ---`);
    console.log(text);
    console.log();
  }

  // Manual score extraction
  const allText = data.submissions.map(s => s.content_text || "").join("\n---\n");
  
  // Find all numbers that look like ratings (1-10)
  let liveScores = [], uiScores = [], proScores = [], payYes = 0, payNo = 0, pubYes = 0, pubNo = 0;
  
  for (const s of data.submissions) {
    const text = s.content_text || "";
    if (text.length < 15) continue; // Skip junk submissions
    
    const lines = text.split("\n");
    for (const line of lines) {
      const lo = line.toLowerCase();
      const numMatch = line.match(/\b(\d+(?:\.\d+)?)\s*(?:\/\s*10)?/);
      const num = numMatch ? parseFloat(numMatch[1]) : null;
      
      if (num && num >= 1 && num <= 10) {
        if (lo.includes("live") || lo.includes("coding experience") || (lo.includes("coding") && lo.includes("rating"))) {
          liveScores.push(num);
        } else if (lo.includes("ui") || lo.includes("design")) {
          uiScores.push(num);
        } else if (lo.includes("professional") || lo.includes("enterprise")) {
          proScores.push(num);
        }
      }
      
      if (lo.includes("publish")) {
        if (/\byes\b/i.test(lo)) pubYes++;
        else if (/\bno\b/i.test(lo)) pubNo++;
      }
      if (lo.includes("pay") || lo.includes("would you")) {
        if (/\byes\b/i.test(lo)) payYes++;
        else if (/\bno\b/i.test(lo)) payNo++;
      }
    }
  }
  
  const avg = arr => arr.length ? (arr.reduce((a,b)=>a+b)/arr.length).toFixed(1) : "N/A";
  
  console.log("=".repeat(60));
  console.log("V3 ANALYSIS");
  console.log("=".repeat(60));
  console.log(`Live Coding: ${avg(liveScores)}/10 (n=${liveScores.length}) [${liveScores.join(", ")}]`);
  console.log(`UI Design: ${avg(uiScores)}/10 (n=${uiScores.length}) [${uiScores.join(", ")}]`);
  console.log(`Professional: ${avg(proScores)}/10 (n=${proScores.length}) [${proScores.join(", ")}]`);
  console.log(`Publishing: OK=${pubYes} Fail=${pubNo}`);
  console.log(`Would pay: Yes=${payYes} No=${payNo} (${payYes+payNo>0?Math.round(payYes/(payYes+payNo)*100):"N/A"}%)`);
  
  console.log("\n--- TARGET CHECK ---");
  const la = liveScores.length ? liveScores.reduce((a,b)=>a+b)/liveScores.length : 0;
  const ua = uiScores.length ? uiScores.reduce((a,b)=>a+b)/uiScores.length : 0;
  const pa = proScores.length ? proScores.reduce((a,b)=>a+b)/proScores.length : 0;
  const pp = payYes+payNo>0 ? payYes/(payYes+payNo) : 0;
  console.log(`Live >= 8: ${la>=8?"PASS":"FAIL"} (${la.toFixed(1)})`);
  console.log(`UI >= 8: ${ua>=8?"PASS":"FAIL"} (${ua.toFixed(1)})`);
  console.log(`Pro >= 8: ${pa>=8?"PASS":"FAIL"} (${pa.toFixed(1)})`);
  console.log(`Pay > 70%: ${pp>0.7?"PASS":"FAIL"} (${Math.round(pp*100)}%)`);
  
  const fs = await import("fs");
  fs.default.writeFileSync("feedback-v3.json", JSON.stringify(data, null, 2));
}
main();
