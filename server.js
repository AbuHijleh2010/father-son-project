const http = require("http");
const fs = require("fs");
const fsPromises = fs.promises;
const path = require("path");

const publicDir = path.join(__dirname, "public");
const port = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, "data");
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const CATEGORIES_FILE = path.join(DATA_DIR, "categories.json");

// Memory cache in case filesystem is read-only (like on Vercel)
const memoryDB = {
  products: null,
  orders: null,
  users: null,
  categories: null,
};

async function readJSONFile(filePath, defaultValue) {
  const fileName = path.basename(filePath, ".json");
  if (memoryDB[fileName] !== null) {
    return memoryDB[fileName];
  }
  try {
    const data = await fsPromises.readFile(filePath, "utf8");
    const parsed = JSON.parse(data);
    memoryDB[fileName] = parsed;
    return parsed;
  } catch (err) {
    memoryDB[fileName] = defaultValue;
    return defaultValue;
  }
}

async function writeJSONFile(filePath, data) {
  const fileName = path.basename(filePath, ".json");
  memoryDB[fileName] = data;
  try {
    await fsPromises.mkdir(DATA_DIR, { recursive: true });
    await fsPromises.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.warn(`[Serverless Cache] Failed to write ${fileName} to file system:`, err.message);
  }
}

const getRequestBody = (req) => {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
};

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

    // API Routes
    if (requestUrl.startsWith("/api/")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");

      // GET /api/categories
      if (requestUrl === "/api/categories" && req.method === "GET") {
        const categories = await readJSONFile(CATEGORIES_FILE, [
          { id: 1, name: "تخفيضات", icon: "🔥" },
          { id: 2, name: "بلايز", icon: "👕" },
          { id: 3, name: "جينز", icon: "👖" },
          { id: 4, name: "أطقم كاملة", icon: "👔" },
          { id: 5, name: "أحذية", icon: "👟" },
          { id: 6, name: "إكسسوارات", icon: "⌚" },
        ]);
        res.writeHead(200);
        res.end(JSON.stringify(categories));
        return;
      }

      // GET /api/products
      if (requestUrl === "/api/products" && req.method === "GET") {
        const products = await readJSONFile(PRODUCTS_FILE, []);
        res.writeHead(200);
        res.end(JSON.stringify(products));
        return;
      }

      // POST /api/products (Create or Update)
      if (requestUrl === "/api/products" && req.method === "POST") {
        const body = await getRequestBody(req);
        const products = await readJSONFile(PRODUCTS_FILE, []);
        if (body.id) {
          // Update
          const index = products.findIndex((p) => p.id.toString() === body.id.toString());
          if (index !== -1) {
            products[index] = { ...products[index], ...body };
            await writeJSONFile(PRODUCTS_FILE, products);
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, product: products[index] }));
          } else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: "Product not found" }));
          }
        } else {
          // Create
          const newProduct = {
            ...body,
            id: Date.now(),
          };
          products.push(newProduct);
          await writeJSONFile(PRODUCTS_FILE, products);
          res.writeHead(201);
          res.end(JSON.stringify({ success: true, product: newProduct }));
        }
        return;
      }

      // DELETE /api/products
      if (requestUrl.startsWith("/api/products") && req.method === "DELETE") {
        const parts = req.url.split("?")[0].split("/");
        let productId = parts[parts.length - 1];
        if (productId === "products") {
          const urlObj = new URL(req.url, "http://localhost");
          productId = urlObj.searchParams.get("id");
        }
        if (!productId) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "Product ID is required" }));
          return;
        }
        const products = await readJSONFile(PRODUCTS_FILE, []);
        const filtered = products.filter((p) => p.id.toString() !== productId.toString());
        if (products.length === filtered.length) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: "Product not found" }));
        } else {
          await writeJSONFile(PRODUCTS_FILE, filtered);
          res.writeHead(200);
          res.end(JSON.stringify({ success: true }));
        }
        return;
      }

      // GET /api/orders
      if (requestUrl === "/api/orders" && req.method === "GET") {
        const orders = await readJSONFile(ORDERS_FILE, [
          { id: "TRK-1001", name: "أحمد محمد", status: "تم الشحن", total: 80.0 },
          { id: "TRK-1002", name: "محمود علي", status: "قيد التجهيز", total: 120.0 },
        ]);
        res.writeHead(200);
        res.end(JSON.stringify(orders));
        return;
      }

      // POST /api/orders (Create or Update status)
      if (requestUrl === "/api/orders" && req.method === "POST") {
        const body = await getRequestBody(req);
        const orders = await readJSONFile(ORDERS_FILE, []);
        if (body.action === "updateStatus") {
          // Update status
          const index = orders.findIndex((o) => o.id === body.id);
          if (index !== -1) {
            orders[index].status = body.status;
            await writeJSONFile(ORDERS_FILE, orders);
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, order: orders[index] }));
          } else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: "Order not found" }));
          }
        } else {
          // Create new order
          const newOrder = {
            ...body,
            created_at: new Date().toISOString(),
          };
          orders.push(newOrder);
          await writeJSONFile(ORDERS_FILE, orders);

          // Reduce product quantities in the database
          try {
            const products = await readJSONFile(PRODUCTS_FILE, []);
            let modified = false;
            const updatedProducts = products.map((product) => {
              const orderedItem = body.items?.find((item) => item.id == product.id);
              if (orderedItem) {
                modified = true;
                const remaining = (product.quantity || 0) - (orderedItem.quantity || 1);
                return { ...product, quantity: remaining > 0 ? remaining : 0 };
              }
              return product;
            });
            if (modified) {
              await writeJSONFile(PRODUCTS_FILE, updatedProducts);
            }
          } catch (e) {
            console.error("Failed to reduce product quantities:", e);
          }

          res.writeHead(201);
          res.end(JSON.stringify({ success: true, order: newOrder }));
        }
        return;
      }

      // POST /api/users/signup
      if (requestUrl === "/api/users/signup" && req.method === "POST") {
        const body = await getRequestBody(req);
        const users = await readJSONFile(USERS_FILE, []);
        const exists = users.some((u) => u.username === body.username || u.email === body.email);
        if (exists) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "اسم المستخدم أو البريد الإلكتروني مسجل بالفعل!" }));
        } else {
          users.push(body);
          await writeJSONFile(USERS_FILE, users);
          res.writeHead(201);
          res.end(JSON.stringify({ success: true, user: { username: body.username, email: body.email } }));
        }
        return;
      }

      // POST /api/users/login
      if (requestUrl === "/api/users/login" && req.method === "POST") {
        const body = await getRequestBody(req);
        const users = await readJSONFile(USERS_FILE, []);
        const user = users.find((u) => u.username === body.username && u.password === body.password);
        if (user) {
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, user: { username: user.username, email: user.email } }));
        } else {
          res.writeHead(401);
          res.end(JSON.stringify({ error: "اسم المستخدم أو كلمة المرور غير صحيحة!" }));
        }
        return;
      }

      res.writeHead(404);
      res.end(JSON.stringify({ error: "API route not found" }));
      return;
    }

    // Static Files serving
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
      stats = await fsPromises.stat(fullPath);
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
