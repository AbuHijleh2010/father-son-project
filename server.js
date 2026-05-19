require("dotenv").config();
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

// --- DATABASE LAYER (PostgreSQL with JSON Graceful Fallback) ---
let pool = null;
let usePostgres = false;

const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl) {
  try {
    const { Pool } = require("pg");
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: {
        rejectUnauthorized: false,
      },
    });
    usePostgres = true;
    console.log("Connected to PostgreSQL cloud database.");
    initializePostgresSchema();
  } catch (err) {
    console.error("Failed to initialize PostgreSQL, falling back to JSON:", err.message);
  }
} else {
  console.log("DATABASE_URL not found in env. Falling back to local JSON database.");
}

async function initializePostgresSchema() {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT NOT NULL
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      price DOUBLE PRECISION NOT NULL,
      image TEXT,
      type TEXT NOT NULL,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      match_id INTEGER,
      sizes TEXT,
      description TEXT,
      quantity INTEGER DEFAULT 0,
      discount INTEGER DEFAULT 0
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user'
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      items TEXT,
      status TEXT,
      total DOUBLE PRECISION,
      created_at TEXT
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS cart (
      username TEXT PRIMARY KEY,
      items TEXT NOT NULL
    )`);

    // Seed default categories
    const catCheck = await pool.query("SELECT COUNT(*) as count FROM categories");
    if (parseInt(catCheck.rows[0].count, 10) === 0) {
      const initialCategories = [
        { name: "تخفيضات", icon: "🔥" },
        { name: "بلايز", icon: "👕" },
        { name: "جينز", icon: "👖" },
        { name: "أطقم كاملة", icon: "👔" },
        { name: "أحذية", icon: "👟" },
        { name: "إكسسوارات", icon: "⌚" },
      ];
      for (const cat of initialCategories) {
        await pool.query("INSERT INTO categories (name, icon) VALUES ($1, $2)", [cat.name, cat.icon]);
      }
    }

    // Seed default admin
    const userCheck = await pool.query("SELECT COUNT(*) as count FROM users");
    if (parseInt(userCheck.rows[0].count, 10) === 0) {
      await pool.query(
        "INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4)",
        ["admin", "admin@store.com", "admin123", "admin"]
      );
    }
    
    // Seed default products
    const prodCheck = await pool.query("SELECT COUNT(*) as count FROM products");
    if (parseInt(prodCheck.rows[0].count, 10) === 0) {
      await pool.query(`
        INSERT INTO products (title, price, image, type, category_id, match_id, sizes, description, quantity, discount) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
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
      ]);
      await pool.query(`
        INSERT INTO products (title, price, image, type, category_id, match_id, sizes, description, quantity, discount) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
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
      ]);
    }
    console.log("PostgreSQL schema and seeding completed successfully.");
  } catch (err) {
    console.error("PostgreSQL schema initialization failed:", err.message);
  }
}

const DB = {
  // CATEGORIES
  async getCategories() {
    if (usePostgres) {
      try {
        const res = await pool.query("SELECT * FROM categories ORDER BY id ASC");
        return res.rows;
      } catch (err) {
        console.error("PostgreSQL getCategories failed, falling back:", err.message);
      }
    }
    return readJSONFile(CATEGORIES_FILE, [
      { id: 1, name: "تخفيضات", icon: "🔥" },
      { id: 2, name: "بلايز", icon: "👕" },
      { id: 3, name: "جينز", icon: "👖" },
      { id: 4, name: "أطقم كاملة", icon: "👔" },
      { id: 5, name: "أحذية", icon: "👟" },
      { id: 6, name: "إكسسوارات", icon: "⌚" },
    ]);
  },

  async saveCategory(category) {
    if (usePostgres) {
      try {
        if (category.id) {
          const res = await pool.query(
            "UPDATE categories SET name = $1, icon = $2 WHERE id = $3 RETURNING *",
            [category.name, category.icon, category.id]
          );
          return res.rows[0];
        } else {
          const res = await pool.query(
            "INSERT INTO categories (name, icon) VALUES ($1, $2) RETURNING *",
            [category.name, category.icon]
          );
          return res.rows[0];
        }
      } catch (err) {
        console.error("PostgreSQL saveCategory failed, falling back:", err.message);
      }
    }
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
  },

  async deleteCategory(id) {
    if (usePostgres) {
      try {
        const res = await pool.query("DELETE FROM categories WHERE id = $1", [id]);
        return res.rowCount > 0;
      } catch (err) {
        console.error("PostgreSQL deleteCategory failed, falling back:", err.message);
      }
    }
    const categories = await this.getCategories();
    const filtered = categories.filter((c) => c.id != id);
    await writeJSONFile(CATEGORIES_FILE, filtered);
    return categories.length !== filtered.length;
  },

  // PRODUCTS
  async getProducts() {
    if (usePostgres) {
      try {
        const res = await pool.query("SELECT * FROM products ORDER BY id ASC");
        return res.rows.map((p) => ({
          ...p,
          sizes: p.sizes ? p.sizes.split(",") : [],
          price: parseFloat(p.price),
          quantity: parseInt(p.quantity || 0, 10),
          discount: parseInt(p.discount || 0, 10),
          match_id: parseInt(p.match_id || 0, 10),
          category_id: p.category_id ? parseInt(p.category_id, 10) : null,
        }));
      } catch (err) {
        console.error("PostgreSQL getProducts failed, falling back:", err.message);
      }
    }
    return readJSONFile(PRODUCTS_FILE, []);
  },

  async saveProduct(product) {
    const sizesStr = Array.isArray(product.sizes) ? product.sizes.join(",") : (product.sizes || "");
    if (usePostgres) {
      try {
        if (product.id) {
          const res = await pool.query(
            `UPDATE products SET title = $1, price = $2, image = $3, type = $4, category_id = $5, 
             match_id = $6, sizes = $7, description = $8, quantity = $9, discount = $10 WHERE id = $11 RETURNING *`,
            [
              product.title,
              parseFloat(product.price),
              product.image,
              product.type,
              product.category_id ? parseInt(product.category_id, 10) : null,
              product.match_id ? parseInt(product.match_id, 10) : null,
              sizesStr,
              product.description,
              parseInt(product.quantity || 0, 10),
              parseInt(product.discount || 0, 10),
              product.id,
            ]
          );
          const p = res.rows[0];
          return p ? { ...p, sizes: p.sizes ? p.sizes.split(",") : [] } : null;
        } else {
          const res = await pool.query(
            `INSERT INTO products (title, price, image, type, category_id, match_id, sizes, description, quantity, discount) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [
              product.title,
              parseFloat(product.price),
              product.image,
              product.type,
              product.category_id ? parseInt(product.category_id, 10) : null,
              product.match_id ? parseInt(product.match_id, 10) : null,
              sizesStr,
              product.description,
              parseInt(product.quantity || 0, 10),
              parseInt(product.discount || 0, 10),
            ]
          );
          const p = res.rows[0];
          return p ? { ...p, sizes: p.sizes ? p.sizes.split(",") : [] } : null;
        }
      } catch (err) {
        console.error("PostgreSQL saveProduct failed, falling back:", err.message);
      }
    }
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
  },

  async deleteProduct(id) {
    if (usePostgres) {
      try {
        const res = await pool.query("DELETE FROM products WHERE id = $1", [id]);
        return res.rowCount > 0;
      } catch (err) {
        console.error("PostgreSQL deleteProduct failed, falling back:", err.message);
      }
    }
    const products = await this.getProducts();
    const filtered = products.filter((p) => p.id.toString() !== id.toString());
    await writeJSONFile(PRODUCTS_FILE, filtered);
    return products.length !== filtered.length;
  },

  // USERS
  async getUsers() {
    if (usePostgres) {
      try {
        const res = await pool.query("SELECT * FROM users");
        return res.rows;
      } catch (err) {
        console.error("PostgreSQL getUsers failed, falling back:", err.message);
      }
    }
    return readJSONFile(USERS_FILE, [
      { username: "admin", email: "admin@store.com", password: "admin123", role: "admin" }
    ]);
  },

  async createUser(user) {
    if (usePostgres) {
      try {
        const res = await pool.query(
          "INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4) RETURNING *",
          [user.username, user.email, user.password, user.role || "user"]
        );
        return res.rows[0];
      } catch (err) {
        console.error("PostgreSQL createUser failed, falling back:", err.message);
      }
    }
    const users = await this.getUsers();
    users.push(user);
    await writeJSONFile(USERS_FILE, users);
    return user;
  },

  // ORDERS
  async getOrders() {
    if (usePostgres) {
      try {
        const res = await pool.query("SELECT * FROM orders");
        return res.rows.map((row) => ({
          ...row,
          items: JSON.parse(row.items || "[]"),
          total: parseFloat(row.total),
        }));
      } catch (err) {
        console.error("PostgreSQL getOrders failed, falling back:", err.message);
      }
    }
    return readJSONFile(ORDERS_FILE, []);
  },

  async createOrder(order) {
    const itemsStr = JSON.stringify(order.items || []);
    if (usePostgres) {
      try {
        const res = await pool.query(
          `INSERT INTO orders (id, name, email, phone, address, items, status, total, created_at) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
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
          ]
        );
        const o = res.rows[0];
        return o ? { ...o, items: JSON.parse(o.items || "[]"), total: parseFloat(o.total) } : null;
      } catch (err) {
        console.error("PostgreSQL createOrder failed, falling back:", err.message);
      }
    }
    const orders = await this.getOrders();
    orders.push(order);
    await writeJSONFile(ORDERS_FILE, orders);
    return order;
  },

  async updateOrderStatus(id, status) {
    if (usePostgres) {
      try {
        const res = await pool.query("UPDATE orders SET status = $1 WHERE id = $2", [status, id]);
        return res.rowCount > 0;
      } catch (err) {
        console.error("PostgreSQL updateOrderStatus failed, falling back:", err.message);
      }
    }
    const orders = await this.getOrders();
    const index = orders.findIndex((o) => o.id === id);
    if (index !== -1) {
      orders[index].status = status;
      await writeJSONFile(ORDERS_FILE, orders);
      return true;
    }
    return false;
  },

  // CART
  async getCart(username) {
    if (usePostgres) {
      try {
        const res = await pool.query("SELECT items FROM cart WHERE username = $1", [username]);
        return res.rows[0] ? JSON.parse(res.rows[0].items) : [];
      } catch (err) {
        console.error("PostgreSQL getCart failed, falling back:", err.message);
      }
    }
    const carts = await readJSONFile(CARTS_FILE, {});
    return carts[username] || [];
  },

  async saveCart(username, items) {
    const itemsStr = JSON.stringify(items);
    if (usePostgres) {
      try {
        await pool.query(
          `INSERT INTO cart (username, items) VALUES ($1, $2) 
           ON CONFLICT(username) DO UPDATE SET items = EXCLUDED.items`,
          [username, itemsStr]
        );
        return true;
      } catch (err) {
        console.error("PostgreSQL saveCart failed, falling back:", err.message);
      }
    }
    const carts = await readJSONFile(CARTS_FILE, {});
    carts[username] = items;
    await writeJSONFile(CARTS_FILE, carts);
    return true;
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

    // Set CORS headers for all requests
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    // Handle CORS preflight options request
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

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
