import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";

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

const server = createServer(async (req, res) => {
  const url = new URL(req.url!, `http://localhost:${PORT}`);

  let filePath = join(DIST, url.pathname);

  if (!(await isFile(filePath))) {
    filePath = join(DIST, url.pathname, "index.html");
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
