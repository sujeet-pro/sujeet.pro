import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { readFile, stat } from "node:fs/promises";
import { watch } from "node:fs";
import { join, extname } from "node:path";
import { renderSite } from "#lib/renderer";

const OUT_DIR = "./dev";
const PORT = 3000;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xml": "application/xml",
  ".ico": "image/x-icon",
};

async function isFile(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isFile();
  } catch {
    return false;
  }
}

async function build() {
  const start = performance.now();
  try {
    await renderSite({
      outDir: OUT_DIR,
      contentDir: "./content",
      layoutsDir: "./layouts",
      publicDir: "./public",
    });
    const elapsed = ((performance.now() - start) / 1000).toFixed(2);
    console.log(`Rebuilt in ${elapsed}s`);
    return true;
  } catch (err) {
    console.error("Build error:", err);
    return false;
  }
}

const WS_SCRIPT = `<script>
(function(){var ws=new WebSocket('ws://'+location.host);
ws.onmessage=function(e){if(e.data==='reload')location.reload()};
ws.onclose=function(){setTimeout(function(){location.reload()},1000)};
})();
</script>`;

function injectReloadScript(html: string): string {
  return html.replace("</body>", WS_SCRIPT + "</body>");
}

console.log("Initial build...");
await build();

const server = createServer(async (req, res) => {
  const url = new URL(req.url!, `http://localhost:${PORT}`);

  let filePath = join(OUT_DIR, url.pathname);

  if (!(await isFile(filePath))) {
    filePath = join(OUT_DIR, url.pathname, "index.html");
  }

  if (!(await isFile(filePath))) {
    const notFoundPath = join(OUT_DIR, "404.html");
    if (await isFile(notFoundPath)) {
      const html = await readFile(notFoundPath, "utf-8");
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end(injectReloadScript(html));
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    }
    return;
  }

  const ext = extname(filePath);
  const contentType = MIME[ext] || "application/octet-stream";

  if (ext === ".html") {
    const html = await readFile(filePath, "utf-8");
    res.writeHead(200, { "Content-Type": contentType });
    res.end(injectReloadScript(html));
  } else {
    const content = await readFile(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  }
});

const wss = new WebSocketServer({ server });
const clients = new Set<import("ws").WebSocket>();

wss.on("connection", (ws) => {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
});

server.listen(PORT, () => {
  console.log(`Dev server running at http://localhost:${PORT}`);
});

let rebuilding = false;
let pendingRebuild = false;

async function rebuild() {
  if (rebuilding) {
    pendingRebuild = true;
    return;
  }
  rebuilding = true;
  const ok = await build();
  if (ok) {
    for (const ws of clients) {
      try {
        ws.send("reload");
      } catch {}
    }
  }
  rebuilding = false;
  if (pendingRebuild) {
    pendingRebuild = false;
    void rebuild();
  }
}

const WATCH_DIRS = ["content", "layouts", "styles", "runtime"];
let debounce: ReturnType<typeof setTimeout> | null = null;

for (const dir of WATCH_DIRS) {
  try {
    watch(dir, { recursive: true }, () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = null;
        void rebuild();
      }, 300);
    });
  } catch {
    // directory may not exist
  }
}
