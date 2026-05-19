// Initial Data Setup
const initialCategories = [
  { id: 1, name: "تخفيضات", icon: "🔥" },
  { id: 2, name: "بلايز", icon: "👕" },
  { id: 3, name: "جينز", icon: "👖" },
  { id: 4, name: "أطقم كاملة", icon: "👔" },
  { id: 5, name: "أحذية", icon: "👟" },
  { id: 6, name: "إكسسوارات", icon: "⌚" },
];

const initialProducts = [];

const initialOrders = [
  { id: "TRK-1001", name: "أحمد محمد", status: "تم الشحن", total: 80.0 },
  { id: "TRK-1002", name: "محمود علي", status: "قيد التجهيز", total: 120.0 },
];

const APP_DATA_VERSION = "3";
const ensureAppDataVersion = () => {
  const current = localStorage.getItem("shopAppVersion");
  if (current !== APP_DATA_VERSION) {
    // Don't overwrite existing products on version change — preserve admin-added items.
    if (!localStorage.getItem("products")) {
      localStorage.setItem("products", JSON.stringify(initialProducts));
    }
    localStorage.setItem("categories", JSON.stringify(initialCategories));
    if (!localStorage.getItem("orders")) {
      localStorage.setItem("orders", JSON.stringify(initialOrders));
    }
    localStorage.setItem("shopAppVersion", APP_DATA_VERSION);
    localStorage.removeItem("selectedSizes");
  }
};
ensureAppDataVersion();

const normalizeStoredProducts = () => {
  const products = JSON.parse(localStorage.getItem("products") || "[]");
  const normalized = products.map((p) => ({
    ...p,
    quantity: Number.isFinite(p.quantity)
      ? p.quantity
      : Number(p.quantity) || 0,
    discount: Number.isFinite(p.discount)
      ? p.discount
      : Number(p.discount) || 0,
  }));
  localStorage.setItem("products", JSON.stringify(normalized));
};

normalizeStoredProducts();

const getLoggedInUser = () => {
  try {
    return JSON.parse(localStorage.getItem("shopUser")) || null;
  } catch {
    return null;
  }
};

const getCurrentPage = () => {
  const path = window.location.pathname.split("/").pop();
  return path === "" ? "index.html" : path;
};

const setLoadingButton = (button, text) => {
  if (!button) return;
  if (!button.dataset.originalText) {
    button.dataset.originalText = button.innerHTML;
  }
  button.disabled = true;
  button.classList.add("loading");
  button.innerHTML = text;
};

const resetLoadingButton = (button) => {
  if (!button) return;
  button.disabled = false;
  button.classList.remove("loading");
  if (button.dataset.originalText) {
    button.innerHTML = button.dataset.originalText;
  }
};

const updateAuthDisplay = () => {
  const user = getLoggedInUser();
  document.querySelectorAll(".nav-actions").forEach((nav) => {
    if (!nav) return;
    if (user) {
      nav.innerHTML = `
                <a href="track.html" class="nav-icon" title="طلباتي"><i data-lucide="package"></i></a>
                <a href="account.html" class="nav-icon" title="حسابي"><i data-lucide="user"></i></a>
                <button class="nav-icon" title="بحث" onclick="document.getElementById('searchInput')?.focus()"><i data-lucide="search"></i></button>
                <button class="nav-icon" title="السلة" style="position: relative;" id="cartBtn">
                    <i data-lucide="shopping-cart"></i>
                    <span id="cartCount" class="cart-badge" style="display: none;">0</span>
                </button>
                <a href="admin.html" class="nav-icon" title="لوحة التحكم"><i data-lucide="lock"></i></a>
                <button class="nav-icon" title="تسجيل خروج" onclick="logout()"><i data-lucide="log-out"></i></button>
                <span style="color: var(--text-main); font-weight: 700; margin-left: 8px;">${user.username}</span>
            `;
    } else {
      nav.innerHTML = `
                <a href="track.html" class="nav-icon" title="طلباتي"><i data-lucide="package"></i></a>
                <a href="login.html" class="nav-icon" title="تسجيل دخول"><i data-lucide="log-in"></i></a>
                <a href="signup.html" class="nav-icon" title="إنشاء حساب"><i data-lucide="user-plus"></i></a>
                <button class="nav-icon" title="بحث" onclick="document.getElementById('searchInput')?.focus()"><i data-lucide="search"></i></button>
                <button class="nav-icon" title="السلة" style="position: relative;" id="cartBtn">
                    <i data-lucide="shopping-cart"></i>
                    <span id="cartCount" class="cart-badge" style="display: none;">0</span>
                </button>
                <a href="admin.html" class="nav-icon" title="لوحة التحكم"><i data-lucide="lock"></i></a>
            `;
    }
    if (typeof lucide !== "undefined") lucide.createIcons();
  });
};

const logout = () => {
  localStorage.removeItem("shopUser");
  localStorage.removeItem("admin_auth");
  updateAuthDisplay();
  renderCart();
  showToast("تم تسجيل الخروج بنجاح");
  if (window.location.pathname.toLowerCase().includes("admin")) {
    location.reload();
  }
};

let selectedCategory = null;
let selectedSizes = JSON.parse(localStorage.getItem("selectedSizes") || "{}");
let adminOrderFilter = "all";

const orderStatusFlow = [
  "تم استلام الطلب",
  "جارٍ التجهيز",
  "تم الشحن",
  "في الطريق إليك",
  "تم التوصيل",
];

const categorySynonyms = {
  تيشيرت: "بلايز",
  قميص: "بلايز",
  بلوزة: "بلايز",
  بنطلون: "جينز",
  سروال: "جينز",
  جينز: "جينز",
  طقم: "أطقم كاملة",
  أطقم: "أطقم كاملة",
  حذاء: "أحذية",
  أحذية: "أحذية",
  ساعة: "إكسسوارات",
  حقيبة: "إكسسوارات",
  عقد: "إكسسوارات",
  تخفيض: "تخفيضات",
  خصم: "تخفيضات",
};

const normalizeSize = (size) => {
  return typeof size === "string" && size.trim() ? size.trim() : null;
};

const saveSelectedSizes = () => {
  localStorage.setItem("selectedSizes", JSON.stringify(selectedSizes));
};

const getCartItems = () =>
  JSON.parse(localStorage.getItem("cartItems") || "[]");
const saveCartItems = (items) => {
  localStorage.setItem("cartItems", JSON.stringify(items));
  const count = items.reduce((acc, item) => acc + (item.quantity || 1), 0);
  localStorage.setItem("cartCount", count.toString());
  updateCartDisplay();
};

const fallbackImage = "https://via.placeholder.com/400x400?text=No+Image";

const getSelectedSize = (product) => {
  const stored = normalizeSize(selectedSizes[product.id]);
  if (stored) return stored;
  if (product.sizes && product.sizes.length > 0) {
    selectedSizes[product.id] = product.sizes[0];
    saveSelectedSizes();
    return product.sizes[0];
  }
  return null;
};

const findCategoryByQuery = (query) => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return null;

  const categories = JSON.parse(localStorage.getItem("categories")) || [];
  const exactSynonym = Object.entries(categorySynonyms).find(([key]) =>
    normalizedQuery.includes(key),
  );
  if (exactSynonym) {
    const catName = exactSynonym[1];
    return (
      categories.find((cat) => cat.name.toLowerCase() === catName.toLowerCase())
        ?.id || null
    );
  }

  const matchingCategory = categories.find((cat) =>
    cat.name.toLowerCase().includes(normalizedQuery),
  );
  return matchingCategory?.id || null;
};

const searchMatches = (product, query) => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  const categories = JSON.parse(localStorage.getItem("categories")) || [];
  const categoryName =
    categories.find((c) => c.id === product.category_id)?.name || "";
  const fields = [
    product.title,
    product.description,
    product.type,
    categoryName,
    product.price?.toString(),
  ];
  return fields.some(
    (field) => field && field.toLowerCase().includes(normalizedQuery),
  );
};

const addCartItem = (newItem) => {
  const cartItems = getCartItems();
  const size = normalizeSize(newItem.size);
  const existing = cartItems.find(
    (item) => item.id == newItem.id && normalizeSize(item.size) === size,
  );

  if (existing) {
    existing.quantity = (existing.quantity || 1) + 1;
  } else {
    cartItems.push({ ...newItem, quantity: 1, size });
  }

  saveCartItems(cartItems);
};

const removeCartItem = (id, size) => {
  const normalized = normalizeSize(size);
  let cartItems = getCartItems();
  cartItems = cartItems.filter(
    (item) => !(item.id == id && normalizeSize(item.size) === normalized),
  );
  saveCartItems(cartItems);
};

const updateCartDisplay = () => {
  const badge = document.getElementById("cartCount");
  const count = parseInt(localStorage.getItem("cartCount") || "0", 10);
  if (badge) {
    if (count > 0) {
      badge.innerText = count;
      badge.style.display = "flex";
    } else {
      badge.style.display = "none";
    }
  }
};

const renderCategories = () => {
  const container = document.getElementById("categoriesContainer");
  if (!container) return;
  const categories = JSON.parse(localStorage.getItem("categories")) || [];
  container.innerHTML = categories
    .map(
      (cat) => `
        <div class="category-card glass ${selectedCategory === cat.id ? "active" : ""}" onclick="handleCategoryClick(${cat.id})">
            <span class="cat-icon">${cat.icon}</span>
            <span style="font-weight: 600">${cat.name}</span>
        </div>
    `,
    )
    .join("");
};

const handleCategoryClick = (id) => {
  if (window.location.pathname.includes("shop.html")) {
    filterByCategory(id);
  } else {
    window.location.href = `shop.html?cat=${id}`;
  }
};

const filterByCategory = (catId) => {
  selectedCategory = catId;
  renderCategories();
  const products = JSON.parse(localStorage.getItem("products")) || [];
  const filtered = products.filter((p) => p.category_id === catId);
  const categories = JSON.parse(localStorage.getItem("categories")) || [];
  const catName = categories.find((c) => c.id === catId)?.name || "";

  const indicator = document.getElementById("filterIndicator");
  if (indicator) {
    indicator.style.display = "block";
    document.getElementById("currentFilter").innerText = catName;
  }

  renderProductsList(filtered);
};

const clearCategoryFilter = () => {
  selectedCategory = null;
  renderProducts();
};

const renderProducts = (filter = "") => {
  const products = JSON.parse(localStorage.getItem("products")) || [];
  const filtered = products.filter((p) => {
    const matchesCategory =
      !selectedCategory || p.category_id === selectedCategory;
    const matchesSearchText = searchMatches(p, filter);
    return matchesCategory && matchesSearchText;
  });

  const indicator = document.getElementById("filterIndicator");
  if (indicator && !selectedCategory) {
    indicator.style.display = "none";
  }

  renderProductsList(filtered);
};

const handleSearchInput = (value) => {
  const matchedCategoryId = findCategoryByQuery(value);
  if (!value.trim()) {
    selectedCategory = null;
    renderCategories();
  } else if (matchedCategoryId) {
    selectedCategory = matchedCategoryId;
    renderCategories();
    scrollToProducts();
  }
  renderProducts(value);
};

const renderProductsList = (list) => {
  const container = document.getElementById("productsContainer");
  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding: 50px; color: var(--text-muted);">
        <p>لا توجد منتجات حالياً. اضغط على "إضافة المنتج" في لوحة الإدارة لإضافة منتجات جديدة.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = list
    .map((p) => {
      if (p.sizes && p.sizes.length > 0 && !selectedSizes[p.id]) {
        selectedSizes[p.id] = p.sizes[0];
        saveSelectedSizes();
      }
      const currentSize = getSelectedSize(p);
      return `
            <div class="product-card" onmousemove="handleCardGlow(event, this)">
                <div class="product-img-wrapper">
                    <img src="${p.image || fallbackImage}" class="product-img" alt="${p.title}" onerror="this.src='${fallbackImage}'">
                    <span class="product-badge">${p.type === "father" ? "للأب 👔" : "للأطفال 👶"}</span>
                    ${p.discount > 0 ? `<span class="discount-badge">خصم ${p.discount}%</span>` : ``}
                </div>
                <div class="product-info">
                    <h3 class="product-title">${p.title}</h3>
                    <p class="product-desc">${p.description || ""}</p>
                    ${
                      p.sizes && p.sizes.length > 0
                        ? `
                        <div class="sizes-row">
                            ${p.sizes
                              .map(
                                (size) => `
                                <button class="size-btn ${currentSize === size ? "active" : ""}" onclick="handleSizeSelect(${p.id}, '${size}')">${size}</button>
                            `,
                              )
                              .join("")}
                        </div>
                    `
                        : ""
                    }
                    <div class="stock-info">${p.quantity > 0 ? `متوفر ${p.quantity} قطعة` : "غير متوفر"}</div>
                    <div class="product-price">${p.discount > 0 ? `<span class="old-price">${p.price.toFixed(2)}$</span> ${((p.price * (100 - p.discount)) / 100).toFixed(2)}$` : `${p.price.toFixed(2)}$`}</div>
                    <div class="product-actions">
                        <button class="add-btn" onclick="addToCart(event, ${p.id})" ${p.quantity > 0 ? "" : "disabled"}>${p.quantity > 0 ? "أضف للسلة" : "نفذت الكمية"}</button>
                        <button class="match-btn" onclick="handleMatch(${p.match_id})">💡 طابق</button>
                    </div>
                </div>
            </div>
        `;
    })
    .join("");

  if (typeof lucide !== "undefined") lucide.createIcons();
};

const handleSizeSelect = (id, size) => {
  selectedSizes[id] = normalizeSize(size);
  saveSelectedSizes();
  renderProducts();
};

const renderCart = () => {
  const container = document.getElementById("cartContent");
  const footer = document.getElementById("cartFooter");
  const totalEl = document.getElementById("cartTotal");
  const cartItems = getCartItems();

  if (!container) return;

  if (cartItems.length === 0) {
    container.innerHTML = `
            <div style="text-align: center; margin-top: 50px; color: var(--text-muted);">
                <i data-lucide="shopping-cart" style="width: 50px; height: 50px; margin-bottom: 15px;"></i>
                <p>السلة فارغة</p>
            </div>
        `;
    if (footer) footer.style.display = "none";
    if (typeof lucide !== "undefined") lucide.createIcons();
    return;
  }

  container.innerHTML = cartItems
    .map(
      (item) => `
        <div class="cart-item">
            <img src="${item.image || fallbackImage}" class="cart-item-img" alt="${item.title}" onerror="this.src='${fallbackImage}'">
            <div style="flex: 1">
                <h4 style="font-size: 0.9rem; margin-bottom: 5px;">${item.title}</h4>
                <p style="color: var(--secondary); font-weight: 700;">${item.price.toFixed(2)}$</p>
                ${item.size ? `<p style="font-size: 0.8rem; color: var(--text-muted); margin: 4px 0;">الحجم: ${item.size}</p>` : ""}
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <button class="qty-btn" onclick="changeCartItemQuantity(${item.id}, ${item.size ? `'${item.size}'` : "null"}, -1)">-</button>
                        <span style="font-size: 0.9rem;">${item.quantity || 1}</span>
                        <button class="qty-btn" onclick="changeCartItemQuantity(${item.id}, ${item.size ? `'${item.size}'` : "null"}, 1)">+</button>
                    </div>
                    <button onclick="removeFromCartStatic(${item.id}, ${item.size ? `'${item.size}'` : "null"})" style="color: #ef4444; background: none; border: none; cursor: pointer; font-size: 0.8rem;">إزالة</button>
                </div>
            </div>
        </div>
    `,
    )
    .join("");

  if (footer) footer.style.display = "block";
  const total = cartItems.reduce(
    (acc, item) => acc + item.price * (item.quantity || 1),
    0,
  );
  if (totalEl) totalEl.innerText = `${total.toFixed(2)}$`;
  if (typeof lucide !== "undefined") lucide.createIcons();
};

const removeFromCartStatic = (id, size) => {
  removeCartItem(id, size);
  renderCart();
};

const handleMatch = (matchId) => {
  if (!matchId) return;
  const products = JSON.parse(localStorage.getItem("products")) || [];
  const match = products.find((p) => p.id === matchId);
  if (match) {
    showToast(`تم إيجاد القطعة المطابقة: ${match.title} ✨`);
  }
};

const showToast = (msg) => {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.innerText = msg;
  toast.style.display = "block";
  setTimeout(() => {
    toast.style.display = "none";
  }, 3000);
};

const scrollToProducts = () => {
  document
    .getElementById("productsSection")
    ?.scrollIntoView({ behavior: "smooth" });
};

const getProductById = (id) => {
  const products = JSON.parse(localStorage.getItem("products")) || [];
  return products.find((p) => p.id === id);
};

const saveProducts = (products) => {
  localStorage.setItem("products", JSON.stringify(products));
};

const renderAdminProducts = () => {
  const body = document.getElementById("adminProductsBody");
  const statsContainer = document.getElementById("adminStats");
  const products = JSON.parse(localStorage.getItem("products")) || [];

  if (body) {
    if (products.length === 0) {
      body.innerHTML = `
            <tr>
                <td colspan="8" style="padding: 24px; text-align: center; color: var(--text-muted);">
                    لا توجد منتجات حالياً. أضف منتجات جديدة من النموذج أعلاه.
                </td>
            </tr>
        `;
    } else {
      body.innerHTML = products
        .map(
          (p) => `
            <tr>
                <td><img src="${p.image || fallbackImage}" width="50" style="border-radius: 5px;" onerror="this.src='${fallbackImage}'"></td>
                <td>${p.title}</td>
                <td>${p.price}$</td>
                <td>${p.quantity ?? 0}</td>
                <td>${p.discount ?? 0}%</td>
                <td>${p.type === "father" ? "أب" : "طفل"}</td>
                <td>${Array.isArray(p.sizes) ? p.sizes.join("، ") : ""}</td>
                <td>
                    <button onclick="populateProductForm(${p.id})" style="color: #0ea5e9; background: none; border: none; cursor: pointer; margin-right: 10px;">تعديل</button>
                    <button onclick="deleteProduct(${p.id})" style="color: #ef4444; background: none; border: none; cursor: pointer;">حذف</button>
                </td>
            </tr>
        `,
        )
        .join("");
    }
  }

  if (statsContainer) {
    const fathers = products.filter((p) => p.type === "father").length;
    const children = products.filter((p) => p.type === "child").length;
    const sizeCount = products.reduce(
      (acc, p) => acc + (Array.isArray(p.sizes) ? p.sizes.length : 0),
      0,
    );
    statsContainer.innerHTML = `
            <div class="admin-stat-card">
                <span>إجمالي المنتجات</span>
                <strong>${products.length}</strong>
            </div>
            <div class="admin-stat-card">
                <span>منتجات الأب</span>
                <strong>${fathers}</strong>
            </div>
            <div class="admin-stat-card">
                <span>منتجات الطفل</span>
                <strong>${children}</strong>
            </div>
            <div class="admin-stat-card">
                <span>عدد الأحجام</span>
                <strong>${sizeCount}</strong>
            </div>
        `;
  }
};

const formatOrderItems = (items) => {
  if (!Array.isArray(items) || items.length === 0)
    return "لم يتم تضمين تفاصيل المنتج.";
  return items
    .map(
      (item) =>
        `${item.title} ×${item.quantity || 1}${item.size ? ` (${item.size})` : ""}`,
    )
    .join("، ");
};

const getNextOrderStatus = (currentStatus) => {
  if (currentStatus === "قيد التجهيز") return "تم الشحن";
  const index = orderStatusFlow.indexOf(currentStatus);
  if (index === -1 || index === orderStatusFlow.length - 1)
    return currentStatus;
  return orderStatusFlow[index + 1];
};

const advanceOrderStatus = (orderId) => {
  const orders = JSON.parse(localStorage.getItem("orders") || "[]");
  const index = orders.findIndex((order) => order.id === orderId);
  if (index === -1) return;
  const current = orders[index].status;
  const next = getNextOrderStatus(current);
  if (next === current) {
    showToast("لا يمكن تحديث حالة الطلب أكثر من ذلك");
    return;
  }
  orders[index].status = next;
  localStorage.setItem("orders", JSON.stringify(orders));
  renderAdminOrders();
  showToast(`تم تحديث حالة الطلب إلى ${next}`);
};

const setAdminOrderFilter = (filter) => {
  adminOrderFilter = filter;
  renderAdminOrders();
};

const renderAdminOrders = () => {
  const body = document.getElementById("adminOrdersBody");
  const badge = document.getElementById("adminOrdersBadge");
  const orders = JSON.parse(localStorage.getItem("orders") || "[]");
  const pendingCount = orders.filter(
    (order) => order.status !== "تم التوصيل",
  ).length;
  const filteredOrders =
    adminOrderFilter === "pending"
      ? orders.filter((order) => order.status !== "تم التوصيل")
      : orders;

  if (body) {
    if (orders.length === 0) {
      body.innerHTML = `
            <tr>
                <td colspan="7" style="padding: 24px; text-align: center; color: var(--text-muted);">
                    لا توجد طلبات حالياً.
                </td>
            </tr>
        `;
    } else if (filteredOrders.length === 0) {
      body.innerHTML = `
            <tr>
                <td colspan="8" style="padding: 24px; text-align: center; color: var(--text-muted);">
                    لا توجد طلبات في الفلتر الحالي.
                </td>
            </tr>
        `;
    } else {
      body.innerHTML = filteredOrders
        .slice()
        .reverse()
        .map(
          (order) => `
            <tr>
                <td>${order.id}</td>
                <td>${order.name || "غير معروف"}</td>
                <td>${order.phone || "غير متوفر"}</td>
                <td>${order.status}</td>
                <td>${order.total}$</td>
                <td>${new Date(
                  order.created_at || order.date || "",
                ).toLocaleDateString("ar-EG", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}</td>
                <td style="text-align: left; max-width: 420px; white-space: normal;">
                  ${formatOrderItems(order.items)}
                </td>
                <td>
                  <button
                    class="hero-btn"
                    style="background: rgba(59,130,246,0.12); color: #2563eb; width: auto;"
                    onclick="advanceOrderStatus('${order.id}')"
                    ${order.status === "تم التوصيل" ? "disabled" : ""}
                  >
                    ${order.status === "تم التوصيل" ? "مكتمل" : "تحديث الحالة"}
                  </button>
                </td>
            </tr>
        `,
        )
        .join("");
    }
  }

  if (badge) {
    badge.innerText = pendingCount
      ? `طلبات جديدة: ${pendingCount}`
      : "لا توجد طلبات جديدة";
  }
};

const populateProductForm = (id) => {
  const product = getProductById(id);
  if (!product) return;

  document.getElementById("pTitle").value = product.title || "";
  document.getElementById("pPrice").value = product.price || "";
  document.getElementById("pImage").value = product.image || "";
  document.getElementById("pType").value = product.type || "father";
  document.getElementById("pMatch").value = product.match_id || "";
  document.getElementById("pSizes").value = Array.isArray(product.sizes)
    ? product.sizes.join(",")
    : "";
  document.getElementById("pQuantity").value = product.quantity ?? 0;
  document.getElementById("pDiscount").value = product.discount ?? 0;
  document.getElementById("pDesc").value = product.description || "";
  document.getElementById("pId").value = product.id;

  document.getElementById("formTitle").innerText = "تعديل المنتج";
  document.getElementById("submitBtn").innerText = "حفظ التعديلات";
  document.getElementById("cancelBtn").style.display = "inline-flex";

  const formSection = document.querySelector(".admin-form-grid");
  formSection?.scrollIntoView({ behavior: "smooth", block: "start" });
};

const cancelEdit = () => {
  document.getElementById("pId").value = "";
  document.getElementById("pTitle").value = "";
  document.getElementById("pPrice").value = "";
  document.getElementById("pImage").value = "";
  document.getElementById("pType").value = "father";
  document.getElementById("pMatch").value = "";
  document.getElementById("pSizes").value = "";
  document.getElementById("pQuantity").value = "0";
  document.getElementById("pDiscount").value = "0";
  document.getElementById("pDesc").value = "";
  document.getElementById("pId").value = "";
  document.getElementById("formTitle").innerText = "إضافة منتج جديد";
  document.getElementById("submitBtn").innerText = "إضافة المنتج";
  document.getElementById("cancelBtn").style.display = "none";
};

const addProduct = () => {
  const id = document.getElementById("pId")?.value;
  const title = document.getElementById("pTitle")?.value;
  const price = parseFloat(document.getElementById("pPrice")?.value || "0");
  const image = document.getElementById("pImage")?.value;
  const type = document.getElementById("pType")?.value;
  const match_id = parseInt(
    document.getElementById("pMatch")?.value || "0",
    10,
  );
  const description = document.getElementById("pDesc")?.value;
  const sizesInput = document.getElementById("pSizes")?.value || "";
  const quantity = parseInt(
    document.getElementById("pQuantity")?.value || "0",
    10,
  );
  const discount = parseInt(
    document.getElementById("pDiscount")?.value || "0",
    10,
  );

  const sizes = sizesInput
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!title || !price || Number.isNaN(price)) {
    return alert("يرجى إدخال العنوان والسعر بشكل صحيح");
  }

  const products = JSON.parse(localStorage.getItem("products")) || [];
  if (id) {
    const existingIndex = products.findIndex(
      (p) => p.id.toString() === id.toString(),
    );
    if (existingIndex !== -1) {
      products[existingIndex] = {
        ...products[existingIndex],
        title,
        price,
        image,
        type,
        match_id,
        description,
        sizes,
        quantity: Number.isFinite(quantity) ? quantity : 0,
        discount: Number.isFinite(discount) ? discount : 0,
      };
      saveProducts(products);
      renderAdminProducts();
      renderProducts();
      cancelEdit();
      return alert("تم تحديث المنتج بنجاح");
    }
  }

  products.push({
    id: Date.now(),
    title,
    price,
    image,
    type,
    category_id: 2,
    match_id,
    sizes,
    description,
    quantity: Number.isFinite(quantity) ? quantity : 0,
    discount: Number.isFinite(discount) ? discount : 0,
  });
  saveProducts(products);
  renderAdminProducts();
  renderProducts();
  cancelEdit();
  alert("تمت إضافة المنتج!");
};

const reduceProductQuantities = (cartItems) => {
  const products = JSON.parse(localStorage.getItem("products")) || [];
  const updated = products.map((product) => {
    const orderedQuantity = cartItems
      .filter((cart) => cart.id === product.id)
      .reduce((sum, item) => sum + (item.quantity || 1), 0);

    if (orderedQuantity === 0) return product;

    const remaining = (product.quantity || 0) - orderedQuantity;
    return {
      ...product,
      quantity: remaining >= 0 ? remaining : 0,
    };
  });
  saveProducts(updated);
};

const addToCart = (event, id) => {
  const button = event?.currentTarget || event?.target;
  setLoadingButton(button, "جاري الإضافة...");

  const products = JSON.parse(localStorage.getItem("products")) || [];
  const product = products.find((p) => p.id === id);
  if (!product) {
    resetLoadingButton(button);
    return;
  }

  const size = getSelectedSize(product);
  const cartItems = getCartItems();
  const existing = cartItems.find(
    (item) => item.id == id && normalizeSize(item.size) === size,
  );
  const currentQuantityInCart = existing ? existing.quantity || 0 : 0;
  if (currentQuantityInCart + 1 > (product.quantity || 0)) {
    resetLoadingButton(button);
    return showToast("لا توجد كمية كافية في المخزون لإضافة هذا المنتج");
  }

  addCartItem({ ...product, size });
  updateCartDisplay();
  showToast(`تمت الإضافة إلى السلة بنجاح! ${size ? `الحجم ${size}` : ""} 🛒`);

  setTimeout(() => resetLoadingButton(button), 400);
};

const changeCartItemQuantity = (id, size, delta) => {
  const normalized = normalizeSize(size);
  const cartItems = getCartItems();
  const item = cartItems.find(
    (i) => i.id == id && normalizeSize(i.size) === normalized,
  );
  if (!item) return;

  const products = JSON.parse(localStorage.getItem("products")) || [];
  const product = products.find((p) => p.id == id);
  const currentQuantity = item.quantity || 1;
  if (delta > 0 && product && currentQuantity + 1 > (product.quantity || 0)) {
    return showToast("لا توجد كمية كافية في المخزون لزيادة الكمية");
  }

  item.quantity = Math.max(0, currentQuantity + delta);
  if (item.quantity <= 0) {
    removeCartItem(id, size);
  } else {
    saveCartItems(cartItems);
  }
  renderCart();
};

const checkoutCart = (event) => {
  const button = event?.currentTarget || event?.target;
  setLoadingButton(button, "جاري إتمام الطلب...");
  const cartItems = getCartItems();
  const user = getLoggedInUser();
  if (cartItems.length === 0) {
    showToast("السلة فارغة، أضف منتجات أولاً لإتمام الشراء");
    resetLoadingButton(button);
    return;
  }

  if (!user) {
    if (
      confirm(
        "يجب تسجيل الدخول لإتمام الشراء. هل تريد الذهاب إلى صفحة تسجيل الدخول الآن؟",
      )
    ) {
      window.location.href = "login.html";
    }
    resetLoadingButton(button);
    return;
  }

  const addressInput = document.getElementById("checkoutAddress");
  const phoneInput = document.getElementById("checkoutPhone");
  const addressError = document.getElementById("checkoutAddressError");
  const phoneError = document.getElementById("checkoutPhoneError");
  const address = addressInput ? addressInput.value.trim() : "";
  const phone = phoneInput ? phoneInput.value.trim() : "";
  if (addressError) {
    addressError.style.display = "none";
  }
  if (phoneError) {
    phoneError.style.display = "none";
  }

  if (!address) {
    if (addressError) {
      addressError.innerText = "الرجاء إدخال عنوان التوصيل لإتمام الطلب.";
      addressError.style.display = "block";
      addressInput?.focus();
    }
    showToast("الرجاء إدخال عنوان التوصيل لإتمام الطلب");
    resetLoadingButton(button);
    return;
  }

  const normalizedPhone = phone.replace(/\s+/g, "");
  const phoneValid = /^\+?\d{7,15}$/.test(normalizedPhone);
  if (!phone || !phoneValid) {
    if (phoneError) {
      phoneError.innerText = "الرجاء إدخال رقم جوال صالح بدون أحرف.";
      phoneError.style.display = "block";
      phoneInput?.focus();
    }
    showToast("الرجاء إدخال رقم جوال صالح لإتمام الطلب");
    resetLoadingButton(button);
    return;
  }

  reduceProductQuantities(cartItems);
  renderProducts();
  renderAdminProducts();

  const orderItems = cartItems.map((item) => ({
    id: item.id,
    title: item.title,
    quantity: item.quantity || 1,
    size: item.size || "",
    price: item.price,
    discount: item.discount || 0,
  }));

  const total = cartItems.reduce(
    (acc, item) => acc + item.price * (item.quantity || 1),
    0,
  );
  const orderId = `TRK-${Math.floor(1000 + Math.random() * 9000)}`;
  const createdAt = new Date().toISOString();
  const orders = JSON.parse(localStorage.getItem("orders") || "[]");
  orders.push({
    id: orderId,
    name: user.username,
    email: user.email || "",
    phone: normalizedPhone,
    address,
    items: orderItems,
    status: "تم استلام الطلب",
    total: total.toFixed(2),
    created_at: createdAt,
  });
  localStorage.setItem("orders", JSON.stringify(orders));
  saveCartItems([]);
  if (addressInput) addressInput.value = "";
  if (phoneInput) phoneInput.value = "";
  localStorage.setItem("cartCount", "0");
  updateCartDisplay();
  renderCart();
  renderAdminOrders();
  showToast(
    `تم إنشاء الطلب: ${orderId}، يمكنك تتبعه الآن عبر رقم الطلب أو رقم الجوال.`,
  );
  setTimeout(() => {
    resetLoadingButton(button);
    window.location.href = `track.html?order=${orderId}`;
  }, 1200);
};

const deleteProduct = (id) => {
  if (!confirm("هل أنت متأكد؟")) return;
  let products = JSON.parse(localStorage.getItem("products")) || [];
  products = products.filter((p) => p.id !== id);
  localStorage.setItem("products", JSON.stringify(products));
  renderAdminProducts();
};

window.addProduct = addProduct;
window.cancelEdit = cancelEdit;
window.populateProductForm = populateProductForm;
window.renderAdminProducts = renderAdminProducts;
window.renderAdminOrders = renderAdminOrders;
window.advanceOrderStatus = advanceOrderStatus;
window.setAdminOrderFilter = setAdminOrderFilter;
window.deleteProduct = deleteProduct;
window.logout = logout;
window.addToCart = addToCart;
window.handleSizeSelect = handleSizeSelect;
window.handleMatch = handleMatch;
window.changeCartItemQuantity = changeCartItemQuantity;
window.removeFromCartStatic = removeFromCartStatic;
window.checkoutCart = checkoutCart;

// Initialize LocalStorage if empty
if (!localStorage.getItem("products"))
  localStorage.setItem("products", JSON.stringify(initialProducts));
if (!localStorage.getItem("categories"))
  localStorage.setItem("categories", JSON.stringify(initialCategories));
if (!localStorage.getItem("orders"))
  localStorage.setItem("orders", JSON.stringify(initialOrders));
if (!localStorage.getItem("cartItems"))
  localStorage.setItem("cartItems", JSON.stringify([]));
if (!localStorage.getItem("cartCount")) localStorage.setItem("cartCount", "0");

// App Logic
document.addEventListener("DOMContentLoaded", () => {
  if (typeof lucide !== "undefined") {
    lucide.createIcons();
  }

  const cursor = document.getElementById("cursor");
  const follower = document.getElementById("follower");
  if (cursor && follower) {
    document.addEventListener("mousemove", (e) => {
      cursor.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
      follower.style.transform = `translate3d(${e.clientX - 10}px, ${e.clientY - 10}px, 0)`;
    });

    const interactables = document.querySelectorAll(
      "button, a, .category-card, .product-card",
    );
    interactables.forEach((el) => {
      el.addEventListener("mouseenter", () => {
        follower.style.transform += " scale(1.5)";
        follower.style.background = "rgba(255,255,255,0.1)";
      });
      el.addEventListener("mouseleave", () => {
        follower.style.transform = follower.style.transform.replace(
          " scale(1.5)",
          "",
        );
        follower.style.background = "transparent";
      });
    });
  }

  const observerOptions = { threshold: 0.1 };
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
      }
    });
  }, observerOptions);

  document.querySelectorAll("section").forEach((section) => {
    section.classList.add("reveal");
    observer.observe(section);
  });

  renderCategories();
  updateAuthDisplay();
  updateCartDisplay();
  const urlParams = new URLSearchParams(window.location.search);
  const catId = urlParams.get("cat");
  if (window.location.pathname.includes("shop.html") && catId) {
    filterByCategory(parseInt(catId, 10));
  } else {
    renderProducts();
  }

  const loader = document.getElementById("loader");
  if (loader) {
    setTimeout(() => (loader.style.display = "none"), 500);
  }

  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      handleSearchInput(e.target.value);
    });
  }

  const mainNav = document.getElementById("mainNav");
  if (mainNav) {
    window.addEventListener("scroll", () => {
      if (window.scrollY > 50) {
        mainNav.classList.add("scrolled");
        mainNav.classList.add("glass");
      } else {
        mainNav.classList.remove("scrolled");
      }
    });
  }

  const cartBtn = document.getElementById("cartBtn");
  const closeCart = document.getElementById("closeCart");
  const cartOverlay = document.getElementById("cartOverlay");

  if (cartBtn && cartOverlay) {
    cartBtn.addEventListener("click", () => {
      renderCart();
      cartOverlay.style.display = "flex";
    });
  }

  if (closeCart && cartOverlay) {
    closeCart.addEventListener("click", () => {
      cartOverlay.style.display = "none";
    });
    cartOverlay.addEventListener("click", (e) => {
      if (e.target === cartOverlay) cartOverlay.style.display = "none";
    });
  }
});
