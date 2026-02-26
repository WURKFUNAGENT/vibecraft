const express = require("express");
const path = require("path");
const fs = require("fs");
const { Pool } = require("pg");
const { v4: uuidv4 } = require("uuid");
const https = require("https");

// Load .env file if present (local dev)
try {
  const envPath = path.join(__dirname, ".env");
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, "utf8")
      .split("\n")
      .forEach((line) => {
        const m = line.match(/^\s*([^#=]+?)\s*=\s*(.*?)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
      });
  }
} catch (_) {}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));

// --- Database ---

let pool = null;
let dbReady = false;

function initDB() {
  if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL not set — publish disabled");
    return;
  }
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  pool.on("error", (err) => {
    console.error("Unexpected DB error:", err.message);
    dbReady = false;
  });
  pool
    .query(
      `CREATE TABLE IF NOT EXISTS sites (
        id TEXT PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL DEFAULT 'Untitled Site',
        html_content TEXT NOT NULL,
        prompt TEXT,
        model TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`
    )
    .then(() => pool.query("CREATE INDEX IF NOT EXISTS idx_sites_slug ON sites(slug)"))
    .then(() => {
      dbReady = true;
      console.log("Database ready");
    })
    .catch((err) => {
      console.error("DB init error:", err.message);
    });
}
initDB();

function slugify(text) {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base || "site"}-${suffix}`;
}

// --- Routes ---

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", db: dbReady, timestamp: new Date().toISOString() });
});

// SSE streaming proxy to OpenRouter
app.post("/api/generate", (req, res) => {
  const { prompt, model, existingCode } = req.body;
  if (!prompt) return res.status(400).json({ error: "prompt is required" });
  if (!process.env.OPENROUTER_API_KEY)
    return res.status(500).json({ error: "OPENROUTER_API_KEY not configured" });

  const modelId =
    model === "kimi" ? "moonshotai/kimi-k2.5" : "openai/gpt-4o-2024-08-06";

  let messages;
  if (existingCode) {
    messages = [
      {
        role: "system",
        content:
          "You are an expert web developer. The user has an existing website and wants to modify it. Output the COMPLETE updated HTML file with the requested changes applied. Output ONLY the HTML code, no explanations.",
      },
      {
        role: "user",
        content: `Here is my current website code:\n\n\`\`\`html\n${existingCode}\n\`\`\`\n\nPlease make this change: ${prompt}`,
      },
    ];
  } else {
    messages = [
      {
        role: "system",
        content:
          "You are an expert web developer. The user will describe a website they want. Generate a COMPLETE, single HTML file that includes all HTML, CSS (in a <style> tag), and JavaScript (in a <script> tag). The site must be fully self-contained — no external dependencies except CDN links for fonts or icons if needed. Make the design modern, beautiful, and responsive. Output ONLY the HTML code, no explanations, no markdown code fences, just pure HTML starting with <!DOCTYPE html>.",
      },
      { role: "user", content: prompt },
    ];
  }

  const payload = JSON.stringify({ model: modelId, stream: true, messages });

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(":\n\n");

  const options = {
    hostname: "openrouter.ai",
    path: "/api/v1/chat/completions",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    },
  };

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    if (!res.writableEnded) {
      res.write("data: [DONE]\n\n");
      res.end();
    }
  };

  const timeout = setTimeout(() => {
    if (!finished) {
      finished = true;
      upstream.destroy();
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: "Generation timed out" })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      }
    }
  }, 120000);

  const upstream = https.request(options, (upstreamRes) => {
    let buffer = "";
    upstreamRes.on("data", (chunk) => {
      if (finished) return;
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") {
          finish();
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content && !res.writableEnded) {
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        } catch (_) {}
      }
    });
    upstreamRes.on("end", finish);
  });

  upstream.on("error", (err) => {
    clearTimeout(timeout);
    console.error("OpenRouter error:", err.message);
    if (!finished) {
      finished = true;
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      }
    }
  });

  res.on("close", () => {
    if (!finished) {
      finished = true;
      clearTimeout(timeout);
      upstream.destroy();
    }
  });

  upstream.write(payload);
  upstream.end();
});

// Publish a site
app.post("/api/publish", async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: "Database not available" });

  const { title, html_content, prompt, model } = req.body;
  if (!html_content)
    return res.status(400).json({ error: "html_content is required" });

  const id = uuidv4();
  const slug = slugify(title || "untitled-site");

  try {
    await pool.query(
      "INSERT INTO sites (id, slug, title, html_content, prompt, model) VALUES ($1, $2, $3, $4, $5, $6)",
      [id, slug, title || "Untitled Site", html_content, prompt || null, model || null]
    );
    const baseUrl =
      req.headers["x-forwarded-host"] || req.headers.host || "localhost:" + PORT;
    const protocol = req.headers["x-forwarded-proto"] || "http";
    res.json({ id, slug, url: `${protocol}://${baseUrl}/site/${slug}` });
  } catch (err) {
    console.error("Publish error:", err.message);
    if (err.code === "23505") {
      return res.status(409).json({ error: "Slug conflict, try again" });
    }
    res.status(500).json({ error: "Failed to publish" });
  }
});

// List recent sites
app.get("/api/sites", async (_req, res) => {
  if (!dbReady) return res.json([]);
  try {
    const result = await pool.query(
      "SELECT id, slug, title, created_at FROM sites ORDER BY created_at DESC LIMIT 20"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("List sites error:", err.message);
    res.json([]);
  }
});

// Serve published site
app.get("/site/:slug", async (req, res) => {
  if (!dbReady) return res.status(503).send("Database not available");
  try {
    const result = await pool.query(
      "SELECT html_content FROM sites WHERE slug = $1",
      [req.params.slug]
    );
    if (result.rows.length === 0) return res.status(404).send("Site not found");
    res.type("html").send(result.rows[0].html_content);
  } catch (err) {
    console.error("Serve site error:", err.message);
    res.status(500).send("Server error");
  }
});

app.listen(PORT, () => {
  console.log(`VibeCraft running on port ${PORT}`);
});
