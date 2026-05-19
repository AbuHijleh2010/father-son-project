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
const CARTS_FILE = path.join(DATA_DIR, "carts.json");

// Memory cache in case filesystem is read-only (like on Vercel)
const memoryDB = {
  products: null,
  orders: null,
  users: null,
  categories: null,
  carts: null,
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

// --- DATABASE LAYER (SQLite with JSON Graceful Fallback) ---
let db = null;
let useSQLite = false;

try {
  const sqlite3 = require("sqlite3").verbose();
  const dbPath = path.join(DATA_DIR, "database.sqlite");
  
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error("Failed to connect to SQLite, falling back to JSON:", err.message);
    } else {
      console.log("Connected to SQLite database.");
      useSQLite = true;
      initializeSQLiteSchema();
    }
  });
} catch (e) {
  console.warn("sqlite3 package is not available or failed to load. Falling back to JSON database:", e.message);
}

function initializeSQLiteSchema() {
  db.serialize(() => {
    // Categories table
    db.run(`CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT NOT NULL
    )`);

    // Products table
    db.run(`CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      price REAL NOT NULL,
      image TEXT,
      type TEXT NOT NULL,
      category_id INTEGER,
      match_id INTEGER,
      sizes TEXT,
      description TEXT,
      quantity INTEGER DEFAULT 0,
      discount INTEGER DEFAULT 0
    )`);

    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user'
    )`);

    // Orders table
    db.run(`CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      items TEXT,
      status TEXT,
      total REAL,
      created_at TEXT
    )`);

    // Cart table
    db.run(`CREATE TABLE IF NOT EXISTS cart (
      username TEXT PRIMARY KEY,
      items TEXT NOT NULL
    )`);

    // Seeding Categories
    db.get("SELECT COUNT(*) as count FROM categories", (err, row) => {
      if (!err && row.count === 0) {
        const stmt = db.prepare("INSERT INTO categories (name, icon) VALUES (?, ?)");
        const initialCategories = [
          { name: "تخفيضات", icon: "🔥" },
          { name: "بلايز", icon: "👕" },
          { name: "جينز", icon: "👖" },
          { name: "أطقم كاملة", icon: "👔" },
          { name: "أحذية", icon: "👟" },
          { name: "إكسسوارات", icon: "⌚" },
        ];
        initialCategories.forEach(cat => stmt.run(cat.name, cat.icon));
        stmt.finalize();
      }
    });

    // Seeding default Admin
    db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
      if (!err && row.count === 0) {
        db.run(
          "INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)",
          ["admin", "admin@store.com", "admin123", "admin"]
        );
      }
    });

    // Seeding sample products
    db.get("SELECT COUNT(*) as count FROM products", (err, row) => {
      if (!err && row.count === 0) {
        const stmt = db.prepare(`
          INSERT INTO products (title, price, image, type, category_id, match_id, sizes, description, quantity, discount) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
          "طقم كاجوال متناسق للأب", 
          120.0, 
          "https://images.unsplash.com/photo-1617137968427-85924c800a22?w=500&auto=format&fit=crop", 
          "father", 
          4, // أطقم كاملة
          101, 
          "S,M,L,XL", 
          "طقم أنيق وعصري ومريح للأب مناسب لجميع الخروجات اليومية.", 
          10, 
          15
        );
        stmt.run(
          "طقم كاجوال متناسق للطفل", 
          80.0, 
          "https://images.unsplash.com/photo-1519457431-44ccd64a579b?w=500&auto=format&fit=crop", 
          "child", 
          4, // أطقم كاملة
          101, 
          "2T,4T,6T,8T", 
          "طقم مريح وجميل للطفل، يتناسق تماماً مع إطلالة الأب.", 
          15, 
          10
        );
        stmt.finalize();
      }
    });
  });
}

const DB = {
  // CATEGORIES
  async getCategories() {
    if (useSQLite) {
      return new Promise((resolve, reject) => {
        db.all("SELECT * FROM categories", [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    } else {
      return readJSONFile(CATEGORIES_FILE, [
        { id: 1, name: "تخفيضات", icon: "🔥" },
        { id: 2, name: "بلايز", icon: "👕" },
        { id: 3, name: "جينز", icon: "👖" },
        { id: 4, name: "أطقم كاملة", icon: "👔" },
        { id: 5, name: "أحذية", icon: "👟" },
        { id: 6, name: "إكسسوارات", icon: "⌚" },
      ]);
    }
  },

  async saveCategory(category) {
    if (useSQLite) {
      return new Promise((resolve, reject) => {
        if (category.id) {
          db.run(
            "UPDATE categories SET name = ?, icon = ? WHERE id = ?",
            [category.name, category.icon, category.id],
            function (err) {
              if (err) reject(err);
              else resolve({ id: Number(category.id), ...category });
            }
          );
        } else {
          db.run(
            "INSERT INTO categories (name, icon) VALUES (?, ?)",
            [category.name, category.icon],
            function (err) {
              if (err) reject(err);
              else resolve({ id: this.lastID, ...category });
            }
          );
        }
      });
    } else {
      const categories = await this.getCategories();
      if (category.id) {
        const index = categories.findIndex((c) => c.id == category.id);
        if (index !== -1) {
          categories[index] = { ...categories[index], ...category };
          await writeJSONFile(CATEGORIES_FILE, categories);
          return categories[index];
        }
      }
      category.id = Date.now();
      categories.push(category);
      await writeJSONFile(CATEGORIES_FILE, categories);
      return category;
    }
  },

  async deleteCategory(id) {
    if (useSQLite) {
      return new Promise((resolve, reject) => {
        db.run("DELETE FROM categories WHERE id = ?", [id], function (err) {
          if (err) reject(err);
          else resolve(this.changes > 0);
        });
      });
    } else {
      const categories = await this.getCategories();
      const filtered = categories.filter((c) => c.id != id);
      await writeJSONFile(CATEGORIES_FILE, filtered);
      return categories.length !== filtered.length;
    }
  },

  // PRODUCTS
  async getProducts() {
    if (useSQLite) {
      return new Promise((resolve, reject) => {
        db.all("SELECT * FROM products", [], (err, rows) => {
          if (err) reject(err);
          else {
            const products = rows.map((row) => ({
              ...row,
              sizes: row.sizes ? row.sizes.split(",") : [],
              price: parseFloat(row.price),
              quantity: parseInt(row.quantity || 0, 10),
              discount: parseInt(row.discount || 0, 10),
              match_id: parseInt(row.match_id || 0, 10),
              category_id: parseInt(row.category_id || 0, 10),
            }));
            resolve(products);
          }
        });
      });
    } else {
      return readJSONFile(PRODUCTS_FILE, []);
    }
  },

  async saveProduct(product) {
    if (useSQLite) {
      const sizesStr = Array.isArray(product.sizes) ? product.sizes.join(",") : (product.sizes || "");
      return new Promise((resolve, reject) => {
        if (product.id) {
          db.run(
            `UPDATE products SET title = ?, price = ?, image = ?, type = ?, category_id = ?, 
             match_id = ?, sizes = ?, description = ?, quantity = ?, discount = ? WHERE id = ?`,
            [
              product.title,
              product.price,
              product.image,
              product.type,
              product.category_id,
              product.match_id,
              sizesStr,
              product.description,
              product.quantity,
              product.discount,
              product.id,
            ],
            function (err) {
              if (err) reject(err);
              else resolve({ ...product });
            }
          );
        } else {
          db.run(
            `INSERT INTO products (title, price, image, type, category_id, match_id, sizes, description, quantity, discount) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              product.title,
              product.price,
              product.image,
              product.type,
              product.category_id,
              product.match_id,
              sizesStr,
              product.description,
              product.quantity,
              product.discount,
            ],
            function (err) {
              if (err) reject(err);
              else resolve({ id: this.lastID, ...product });
            }
          );
        }
      });
    } else {
      const products = await this.getProducts();
      if (product.id) {
        const index = products.findIndex((p) => p.id.toString() === product.id.toString());
        if (index !== -1) {
          products[index] = { ...products[index], ...product };
          await writeJSONFile(PRODUCTS_FILE, products);
          return products[index];
        } else {
          throw new Error("Product not found");
        }
      } else {
        const newProduct = { ...product, id: Date.now() };
        products.push(newProduct);
        await writeJSONFile(PRODUCTS_FILE, products);
        return newProduct;
      }
    }
  },

  async deleteProduct(id) {
    if (useSQLite) {
      return new Promise((resolve, reject) => {
        db.run("DELETE FROM products WHERE id = ?", [id], function (err) {
          if (err) reject(err);
          else resolve(this.changes > 0);
        });
      });
    } else {
      const products = await this.getProducts();
      const filtered = products.filter((p) => p.id.toString() !== id.toString());
      await writeJSONFile(PRODUCTS_FILE, filtered);
      return products.length !== filtered.length;
    }
  },

  // USERS
  async getUsers() {
    if (useSQLite) {
      return new Promise((resolve, reject) => {
        db.all("SELECT * FROM users", [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    } else {
      return readJSONFile(USERS_FILE, [
        { username: "admin", email: "admin@store.com", password: "admin123", role: "admin" }
      ]);
    }
  },

  async createUser(user) {
    if (useSQLite) {
      return new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)",
          [user.username, user.email, user.password, user.role || "user"],
          function (err) {
            if (err) reject(err);
            else resolve({ id: this.lastID, ...user });
          }
        );
      });
    } else {
      const users = await this.getUsers();
      users.push(user);
      await writeJSONFile(USERS_FILE, users);
      return user;
    }
  },

  // ORDERS
  async getOrders() {
    if (useSQLite) {
      return new Promise((resolve, reject) => {
        db.all("SELECT * FROM orders", [], (err, rows) => {
          if (err) reject(err);
          else {
            const orders = rows.map((row) => ({
              ...row,
              items: JSON.parse(row.items || "[]"),
              total: parseFloat(row.total),
            }));
            resolve(orders);
          }
        });
      });
    } else {
      return readJSONFile(ORDERS_FILE, []);
    }
  },

  async createOrder(order) {
    if (useSQLite) {
      const itemsStr = JSON.stringify(order.items || []);
      return new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO orders (id, name, email, phone, address, items, status, total, created_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            order.id,
            order.name,
            order.email,
            order.phone,
            order.address,
            itemsStr,
            order.status,
            order.total,
            order.created_at,
          ],
          function (err) {
            if (err) reject(err);
            else resolve(order);
          }
        );
      });
    } else {
      const orders = await this.getOrders();
      orders.push(order);
      await writeJSONFile(ORDERS_FILE, orders);
      return order;
    }
  },

  async updateOrderStatus(id, status) {
    if (useSQLite) {
      return new Promise((resolve, reject) => {
        db.run("UPDATE orders SET status = ? WHERE id = ?", [status, id], function (err) {
          if (err) reject(err);
          else resolve(this.changes > 0);
        });
      });
    } else {
      const orders = await this.getOrders();
      const index = orders.findIndex((o) => o.id === id);
      if (index !== -1) {
        orders[index].status = status;
        await writeJSONFile(ORDERS_FILE, orders);
        return true;
      }
      return false;
    }
  },

  // CART
  async getCart(username) {
    if (useSQLite) {
      return new Promise((resolve, reject) => {
        db.get("SELECT items FROM cart WHERE username = ?", [username], (err, row) => {
          if (err) reject(err);
          else resolve(row ? JSON.parse(row.items) : []);
        });
      });
    } else {
      const carts = await readJSONFile(CARTS_FILE, {});
      return carts[username] || [];
    }
  },

  async saveCart(username, items) {
    if (useSQLite) {
      const itemsStr = JSON.stringify(items);
      return new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO cart (username, items) VALUES (?, ?) 
           ON CONFLICT(username) DO UPDATE SET items = excluded.items`,
          [username, itemsStr],
          function (err) {
            if (err) reject(err);
            else resolve(true);
          }
        );
      });
    } else {
      const carts = await readJSONFile(CARTS_FILE, {});
      carts[username] = items;
      await writeJSONFile(CARTS_FILE, carts);
      return true;
    }
  }
};

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
        const categories = await DB.getCategories();
        res.writeHead(200);
        res.end(JSON.stringify(categories));
        return;
      }

      // POST /api/categories (Add or Edit)
      if (requestUrl === "/api/categories" && req.method === "POST") {
        const body = await getRequestBody(req);
        const category = await DB.saveCategory(body);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, category }));
        return;
      }

      // DELETE /api/categories
      if (requestUrl.startsWith("/api/categories") && req.method === "DELETE") {
        const urlObj = new URL(req.url, "http://localhost");
        const categoryId = urlObj.searchParams.get("id");
        if (!categoryId) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "Category ID is required" }));
          return;
        }
        const success = await DB.deleteCategory(categoryId);
        res.writeHead(success ? 200 : 404);
        res.end(JSON.stringify({ success }));
        return;
      }

      // GET /api/products
      if (requestUrl === "/api/products" && req.method === "GET") {
        const products = await DB.getProducts();
        res.writeHead(200);
        res.end(JSON.stringify(products));
        return;
      }

      // POST /api/products (Create or Update)
      if (requestUrl === "/api/products" && req.method === "POST") {
        const body = await getRequestBody(req);
        const saved = await DB.saveProduct(body);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, product: saved }));
        return;
      }

      // DELETE /api/products
      if (requestUrl.startsWith("/api/products") && req.method === "DELETE") {
        let productId = null;
        const urlObj = new URL(req.url, "http://localhost");
        productId = urlObj.searchParams.get("id");
        if (!productId) {
          const parts = requestUrl.split("/");
          productId = parts[parts.length - 1];
        }
        if (!productId || productId === "products") {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "Product ID is required" }));
          return;
        }
        const success = await DB.deleteProduct(productId);
        res.writeHead(success ? 200 : 404);
        res.end(JSON.stringify({ success }));
        return;
      }

      // GET /api/orders
      if (requestUrl === "/api/orders" && req.method === "GET") {
        const orders = await DB.getOrders();
        res.writeHead(200);
        res.end(JSON.stringify(orders));
        return;
      }

      // POST /api/orders (Create or Update status)
      if (requestUrl === "/api/orders" && req.method === "POST") {
        const body = await getRequestBody(req);
        if (body.action === "updateStatus") {
          const success = await DB.updateOrderStatus(body.id, body.status);
          res.writeHead(success ? 200 : 404);
          res.end(JSON.stringify({ success }));
        } else {
          const orderId = `TRK-${Math.floor(1000 + Math.random() * 9000)}`;
          const newOrder = {
            ...body,
            id: orderId,
            created_at: new Date().toISOString(),
          };
          await DB.createOrder(newOrder);

          // Reduce product quantities in the database
          try {
            const products = await DB.getProducts();
            for (const product of products) {
              const orderedItem = body.items?.find((item) => item.id == product.id);
              if (orderedItem) {
                const remaining = (product.quantity || 0) - (orderedItem.quantity || 1);
                product.quantity = remaining > 0 ? remaining : 0;
                await DB.saveProduct(product);
              }
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
        const users = await DB.getUsers();
        const exists = users.some((u) => u.username === body.username || u.email === body.email);
        if (exists) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "اسم المستخدم أو البريد الإلكتروني مسجل بالفعل!" }));
        } else {
          const newUser = await DB.createUser({
            username: body.username,
            email: body.email,
            password: body.password,
            role: "user",
          });
          res.writeHead(201);
          res.end(JSON.stringify({ success: true, user: { username: newUser.username, email: newUser.email } }));
        }
        return;
      }

      // POST /api/users/login
      if (requestUrl === "/api/users/login" && req.method === "POST") {
        const body = await getRequestBody(req);
        const users = await DB.getUsers();
        const user = users.find((u) => u.username === body.username && u.password === body.password);
        if (user) {
          res.writeHead(200);
          res.end(JSON.stringify({ 
            success: true, 
            user: { username: user.username, email: user.email, role: user.role } 
          }));
        } else {
          res.writeHead(401);
          res.end(JSON.stringify({ error: "اسم المستخدم أو كلمة المرور غير صحيحة!" }));
        }
        return;
      }

      // GET /api/cart
      if (requestUrl === "/api/cart" && req.method === "GET") {
        const urlObj = new URL(req.url, "http://localhost");
        const username = urlObj.searchParams.get("username");
        if (!username) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "Username is required" }));
          return;
        }
        const items = await DB.getCart(username);
        res.writeHead(200);
        res.end(JSON.stringify(items));
        return;
      }

      // POST /api/cart
      if (requestUrl === "/api/cart" && req.method === "POST") {
        const body = await getRequestBody(req);
        if (!body.username) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "Username is required" }));
          return;
        }
        await DB.saveCart(body.username, body.items || []);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true }));
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
