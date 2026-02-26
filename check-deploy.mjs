import https from "https";
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

const info = JSON.parse(fs.readFileSync(path.join(__dirname, "deploy-info.json"), "utf8"));

function railwayQuery(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query, variables });
    const req = https.request({
      hostname: "backboard.railway.app",
      path: "/graphql/v2",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${vars.RAILWAY_API_KEY}`,
      },
    }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve(JSON.parse(body)));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const result = await railwayQuery(`query {
    deployments(input: {
      projectId: "${info.projectId}"
      serviceId: "${info.serviceId}"
      environmentId: "${info.environmentId}"
    }) {
      edges { node { id status staticUrl createdAt } }
    }
  }`);

  const deps = result.data.deployments.edges;
  for (const e of deps) {
    console.log(`Status: ${e.node.status} | URL: ${e.node.staticUrl} | Created: ${e.node.createdAt}`);
  }

  const latest = deps[0]?.node;
  if (latest?.status === "SUCCESS") {
    console.log("\nDeployment is LIVE!");
    console.log(`URL: https://${info.domain}`);
  } else {
    console.log(`\nLatest deployment status: ${latest?.status || "UNKNOWN"}`);
    console.log("Waiting...");
  }
}

main().catch(console.error);
