// Minimalny serwer statyczny do testów lokalnych (bez zależności).
// node serve.mjs [port]
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, extname } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2]) || 3020;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = join(root, normalize(path).replace(/^([/\\])+/, ""));
    if (!file.startsWith(root)) throw Object.assign(new Error("poza katalogiem"), { code: 403 });
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch (e) {
    const code = e.code === "ENOENT" ? 404 : e.code === 403 ? 403 : 500;
    res.writeHead(code, { "content-type": "text/plain; charset=utf-8" });
    res.end(code === 404 ? "404" : e.message);
  }
}).listen(port, () => console.log("http://localhost:" + port + "/"));
