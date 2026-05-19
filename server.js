const http = require("http");
const fs = require("fs");
const path = require("path");

const publicDir = path.join(__dirname, "public");
const port = process.env.PORT || 3000;

const mimeTypes = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  webp: "image/webp",
  txt: "text/plain; charset=utf-8",
};

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = decodeURIComponent(req.url.split("?")[0]);
    let filePath = requestUrl === "/" ? "/index.html" : requestUrl;
    if (filePath.startsWith("/")) filePath = filePath.slice(1);

    const normalizedPath = path.normalize(filePath);
    if (normalizedPath.includes("..")) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Bad Request");
      return;
    }

    const fullPath = path.join(publicDir, normalizedPath);
    let stats;
    try {
      stats = await fs.promises.stat(fullPath);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    if (stats.isDirectory()) {
      res.writeHead(301, { Location: "/" });
      res.end();
      return;
    }

    const ext = path.extname(fullPath).slice(1).toLowerCase();
    const contentType = mimeTypes[ext] || "application/octet-stream";

    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(fullPath).pipe(res);
  } catch (error) {
    console.error(error);
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Server error");
  }
});

server.listen(port, () => {
  console.log(`Static server running at http://localhost:${port}`);
});
