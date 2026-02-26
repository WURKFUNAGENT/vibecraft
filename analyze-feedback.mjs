import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const secret = "DADBUA4qWV5UHq8DB2iOUDnL";
  const res = await fetch(`https://wurkapi.fun/solana/agenttohuman?action=view&secret=${secret}`);
  const data = await res.json();

  console.log(`Total submissions: ${data.submissions.length}`);
  console.log("=".repeat(60));

  const scores = {
    liveCoding: [],
    uiDesign: [],
    professional: [],
    modelPref: { gpt4o: 0, kimi: 0, same: 0 },
    publishWorked: { yes: 0, no: 0 },
    wouldPay: { yes: 0, no: 0 },
    bugs: [],
    suggestions: [],
  };

  for (let i = 0; i < data.submissions.length; i++) {
    const s = data.submissions[i];
    const text = s.content_text || "";
    console.log(`\n--- Submission ${i + 1} ---`);
    console.log(text.slice(0, 500));

    // Extract ratings
    const liveCodingMatch = text.match(/live\s*coding.*?(\d+)/i) || text.match(/coding\s*experience.*?(\d+)/i);
    const uiMatch = text.match(/ui\s*design.*?(\d+)/i) || text.match(/design\s*rating.*?(\d+)/i);
    const proMatch = text.match(/professional.*?(\d+)/i) || text.match(/enterprise.*?(\d+)/i);

    if (liveCodingMatch) scores.liveCoding.push(parseInt(liveCodingMatch[1]));
    if (uiMatch) scores.uiDesign.push(parseInt(uiMatch[1]));
    if (proMatch) scores.professional.push(parseInt(proMatch[1]));

    // Model preference
    if (/gpt.*4o/i.test(text) && !/kimi/i.test(text.split(/model|better|produced/i).pop())) {
      scores.modelPref.gpt4o++;
    } else if (/kimi/i.test(text) && !/gpt/i.test(text.split(/model|better|produced/i).pop())) {
      scores.modelPref.kimi++;
    } else {
      scores.modelPref.same++;
    }

    // Publishing
    if (/publish.*?yes/i.test(text) || /did publishing work.*?yes/i.test(text)) {
      scores.publishWorked.yes++;
    } else if (/publish.*?no/i.test(text) || /did publishing work.*?no/i.test(text)) {
      scores.publishWorked.no++;
    }

    // Would pay
    if (/would you pay.*?yes/i.test(text) || /pay.*?yes/i.test(text)) {
      scores.wouldPay.yes++;
    } else if (/would you pay.*?no/i.test(text) || /pay.*?no/i.test(text)) {
      scores.wouldPay.no++;
    }

    // Bugs
    const bugMatch = text.match(/bugs?.*?:(.+?)(?:\n|$)/i);
    if (bugMatch && !/none/i.test(bugMatch[1])) {
      scores.bugs.push(bugMatch[1].trim());
    }

    // Suggestions
    const sugMatch = text.match(/suggestion.*?:(.+?)(?:\n|$)/i) || text.match(/improve.*?:(.+?)(?:\n|$)/i);
    if (sugMatch && sugMatch[1].trim().length > 5) {
      scores.suggestions.push(sugMatch[1].trim());
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("ANALYSIS SUMMARY");
  console.log("=".repeat(60));

  const avg = (arr) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : "N/A";
  console.log(`\nLive Coding Experience: ${avg(scores.liveCoding)}/10 (${scores.liveCoding.length} ratings: [${scores.liveCoding.join(", ")}])`);
  console.log(`UI Design: ${avg(scores.uiDesign)}/10 (${scores.uiDesign.length} ratings: [${scores.uiDesign.join(", ")}])`);
  console.log(`Professional: ${avg(scores.professional)}/10 (${scores.professional.length} ratings: [${scores.professional.join(", ")}])`);
  console.log(`\nModel Preference: GPT-4o=${scores.modelPref.gpt4o}, Kimi=${scores.modelPref.kimi}, Same=${scores.modelPref.same}`);
  console.log(`Publishing worked: Yes=${scores.publishWorked.yes}, No=${scores.publishWorked.no}`);
  console.log(`Would pay: Yes=${scores.wouldPay.yes}, No=${scores.wouldPay.no} (${scores.wouldPay.yes + scores.wouldPay.no > 0 ? ((scores.wouldPay.yes / (scores.wouldPay.yes + scores.wouldPay.no)) * 100).toFixed(0) : "N/A"}%)`);
  console.log(`\nBugs reported (${scores.bugs.length}):`);
  scores.bugs.forEach((b) => console.log(`  - ${b}`));
  console.log(`\nImprovement suggestions (${scores.suggestions.length}):`);
  scores.suggestions.forEach((s) => console.log(`  - ${s}`));

  // Save raw data for reference
  fs.writeFileSync(
    path.join(__dirname, "feedback-v1.json"),
    JSON.stringify({ submissions: data.submissions, analysis: scores }, null, 2)
  );
  console.log("\nSaved raw data to feedback-v1.json");
}

main().catch(console.error);
