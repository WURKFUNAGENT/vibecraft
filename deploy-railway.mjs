import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env
const envContent = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
const vars = {};
envContent.split("\n").forEach((l) => {
  const m = l.match(/^\s*([^#=]+?)\s*=\s*(.*?)\s*$/);
  if (m) vars[m[1]] = m[2];
});

function railwayQuery(token, query, variables = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query, variables });
    const options = {
      hostname: "backboard.railway.app",
      path: "/graphql/v2",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "Content-Length": Buffer.byteLength(data),
      },
    };
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.errors) {
            console.error("GraphQL errors:", JSON.stringify(parsed.errors, null, 2));
          }
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Failed to parse response: ${body}`));
        }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const TOKEN = vars.RAILWAY_API_KEY;
  const APP_NAME = "vibecraft";

  // 1. Get workspace
  console.log("1. Getting workspace...");
  const ws = await railwayQuery(TOKEN, `{ me { workspaces { id name } } }`);
  const workspaceId = ws.data.me.workspaces[0].id;
  console.log(`   Workspace: ${workspaceId} (${ws.data.me.workspaces[0].name})`);

  // 2. Create project
  console.log("2. Creating project...");
  const proj = await railwayQuery(
    TOKEN,
    `mutation($input: ProjectCreateInput!) {
      projectCreate(input: $input) {
        id name environments { edges { node { id name } } }
      }
    }`,
    { input: { name: APP_NAME, workspaceId } }
  );
  const project = proj.data.projectCreate;
  const envId = project.environments.edges[0].node.id;
  console.log(`   Project: ${project.id}`);
  console.log(`   Environment: ${envId}`);

  // 3. Create service
  console.log("3. Creating service...");
  const svc = await railwayQuery(
    TOKEN,
    `mutation($input: ServiceCreateInput!) {
      serviceCreate(input: $input) { id name }
    }`,
    { input: { name: "web", projectId: project.id } }
  );
  const service = svc.data.serviceCreate;
  console.log(`   Service: ${service.id}`);

  // 4. Set environment variables
  console.log("4. Setting environment variables...");
  const envVarsToSet = {
    OPENROUTER_API_KEY: vars.OPENROUTER_API_KEY,
    DATABASE_URL: vars.DATABASE_URL,
  };
  for (const [key, value] of Object.entries(envVarsToSet)) {
    await railwayQuery(
      TOKEN,
      `mutation($input: VariableCollectionUpsertInput!) {
        variableCollectionUpsert(input: $input)
      }`,
      {
        input: {
          projectId: project.id,
          environmentId: envId,
          serviceId: service.id,
          variables: { [key]: value },
        },
      }
    );
    console.log(`   Set ${key}`);
  }

  // 5. Create domain
  console.log("5. Creating domain...");
  const dom = await railwayQuery(
    TOKEN,
    `mutation($input: ServiceDomainCreateInput!) {
      serviceDomainCreate(input: $input) { id domain }
    }`,
    { input: { serviceId: service.id, environmentId: envId } }
  );
  const domain = dom.data.serviceDomainCreate.domain;
  console.log(`   Domain: https://${domain}`);

  // 6. Create project token for CLI
  console.log("6. Creating project token...");
  const tok = await railwayQuery(
    TOKEN,
    `mutation {
      projectTokenCreate(input: {
        projectId: "${project.id}"
        environmentId: "${envId}"
        name: "deploy-token"
      })
    }`
  );
  const projectToken = tok.data.projectTokenCreate;
  console.log(`   Token created`);

  // Output deployment info
  console.log("\n=== DEPLOYMENT INFO ===");
  console.log(`PROJECT_ID=${project.id}`);
  console.log(`ENVIRONMENT_ID=${envId}`);
  console.log(`SERVICE_ID=${service.id}`);
  console.log(`DOMAIN=https://${domain}`);
  console.log(`PROJECT_TOKEN=${projectToken}`);
  console.log(`\nDeploy command:`);
  console.log(`$env:RAILWAY_TOKEN="${projectToken}"; railway up --service ${service.id}`);

  // Save deployment info for later use
  fs.writeFileSync(
    path.join(__dirname, "deploy-info.json"),
    JSON.stringify(
      {
        projectId: project.id,
        environmentId: envId,
        serviceId: service.id,
        domain,
        projectToken,
      },
      null,
      2
    )
  );
  console.log("\nSaved to deploy-info.json");
}

main().catch(console.error);
