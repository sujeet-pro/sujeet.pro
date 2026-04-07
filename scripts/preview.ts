import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import JSON5 from "json5";

const DIST = "./dist";
const PORT = 4000;

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

async function getBasePath(): Promise<string> {
  if (process.env.BASE_PATH !== undefined) return process.env.BASE_PATH.replace(/\/+$/, "");
  try {
    const raw = await readFile("./content/site.json5", "utf-8");
    const config = JSON5.parse(raw) as { basePath?: string };
    return config.basePath ?? "";
  } catch {
    return "";
  }
}

const basePath = await getBasePath();

const server = createServer(async (req, res) => {
  const url = new URL(req.url!, `http://localhost:${PORT}`);

  let pathname = url.pathname;
  if (basePath && pathname.startsWith(basePath)) {
    pathname = pathname.slice(basePath.length) || "/";
  }

  let filePath = join(DIST, pathname);

  if (!(await isFile(filePath))) {
    filePath = join(DIST, pathname, "index.html");
  }

  if (!(await isFile(filePath))) {
    const notFoundPath = join(DIST, "404.html");
    if (await isFile(notFoundPath)) {
      const content = await readFile(notFoundPath);
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end(content);
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    }
    return;
  }

  const ext = extname(filePath);
  const contentType = MIME[ext] || "application/octet-stream";
  const content = await readFile(filePath);
  res.writeHead(200, { "Content-Type": contentType });
  res.end(content);
});

server.listen(PORT, () => {
  console.log(`Preview server running at http://localhost:${PORT}`);
});
