import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { refreshData } from "./refresh-data.mjs";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 4173);

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
]);

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname === "/api/refresh") {
    if (!["GET", "POST"].includes(request.method)) {
      sendJson(response, 405, { error: "method_not_allowed" });
      return;
    }

    try {
      const data = await refreshData({ log: false });
      sendJson(response, 200, data);
    } catch (error) {
      sendJson(response, 500, { error: "refresh_failed", message: error.message });
    }
    return;
  }

  serveStatic(url.pathname, response).catch((error) => {
    if (error.code === "ENOENT") {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end("Server error");
  });
});

async function serveStatic(urlPath, response) {
  const relativePath = decodeURIComponent(urlPath === "/" ? "/index.html" : urlPath);
  const filePath = path.resolve(ROOT_DIR, `.${relativePath}`);
  if (!filePath.startsWith(ROOT_DIR)) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  const body = await fs.readFile(filePath);
  const type = contentTypes.get(path.extname(filePath)) || "application/octet-stream";
  response.writeHead(200, { "content-type": type });
  response.end(body);
}

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Aipri map server: http://127.0.0.1:${PORT}/`);
});
