// Common variables and utilities shared across pages

// Redirect API calls to local server port 3000 if page is opened from Live Server or file system
const getApiBaseUrl = () => {
  const origin = window.location.origin;
  const protocol = window.location.protocol;
  const port = window.location.port;
  if (protocol === "file:" || ((origin.includes("localhost") || origin.includes("127.0.0.1")) && port !== "3000" && port !== "")) {
    return "http://localhost:3000";
  }
  return "";
};
const API_BASE_URL = getApiBaseUrl();

const originalFetch = window.fetch;
window.fetch = async function (input, init) {
  if (typeof input === "string" && input.startsWith("/api/")) {
    input = API_BASE_URL + input;
    const method = (init && init.method) || "GET";
    if (method.toUpperCase() === "GET") {
      const separator = input.includes("?") ? "&" : "?";
      input += separator + "_t=" + new Date().getTime();
    }
  }

  const timeoutMs = 15000; // 15 seconds timeout
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  
  const modifiedInit = { ...init, signal: controller.signal };
  
  try {
    const response = await originalFetch(input, modifiedInit);
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    if (err.name === 'AbortError') {
      console.error(`Fetch timeout for ${input}`);
      showToast("عذراً، الخادم يستغرق وقتاً طويلاً للرد. يرجى المحاولة لاحقاً.");
      throw new Error("Request timed out.");
    }
    throw err;
  }
};

const fallbackImage = "https://via.placeholder.com/400x400?text=No+Image";
let selectedSizes = JSON.parse(localStorage.getItem("selectedSizes") || "{}");

const normalizeSize = (size) => {
  return typeof size === "string" && size.trim() ? size.trim() : null;
};

const saveSelectedSizes = () => {
  localStorage.setItem("selectedSizes", JSON.stringify(selectedSizes));
};

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

// Toast notification helper
const showToast = (msg) => {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.innerText = msg;
  toast.style.display = "block";
  setTimeout(() => {
    toast.style.display = "none";
  }, 3000);
};

// Session / User Utilities
const getLoggedInUser = () => {
  try {
    return JSON.parse(localStorage.getItem("shopUser")) || null;
  } catch {
    return null;
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

// Cart Utilities
const getCartItems = () => JSON.parse(localStorage.getItem("cartItems") || "[]");

const syncCartWithServer = async (items) => {
  const user = getLoggedInUser();
  if (!user) return;
  try {
    await fetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user.username, items }),
    });
  } catch (err) {
    console.error("Failed to sync cart with server:", err);
  }
};

const fetchAndMergeCart = async () => {
  const user = getLoggedInUser();
  if (!user) return;
  try {
    const response = await fetch(`/api/cart?username=${encodeURIComponent(user.username)}`);
    if (response.ok) {
      const serverItems = await response.json();
      
      const localItems = getCartItems();
      const mergedItems = [...serverItems];
      
      localItems.forEach((localItem) => {
        const existing = mergedItems.find(
          (item) => item.id == localItem.id && normalizeSize(item.size) === normalizeSize(localItem.size)
        );
        if (existing) {
          existing.quantity = Math.max(existing.quantity || 1, localItem.quantity || 1);
        } else {
          mergedItems.push(localItem);
        }
      });
      
      localStorage.setItem("cartItems", JSON.stringify(mergedItems));
      const count = mergedItems.reduce((acc, item) => acc + (item.quantity || 1), 0);
      localStorage.setItem("cartCount", count.toString());
      updateCartDisplay();
      
      await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user.username, items: mergedItems }),
      });
    }
  } catch (err) {
    console.error("Failed to fetch/merge cart:", err);
  }
};

const saveCartItems = (items) => {
  localStorage.setItem("cartItems", JSON.stringify(items));
  const count = items.reduce((acc, item) => acc + (item.quantity || 1), 0);
  localStorage.setItem("cartCount", count.toString());
  updateCartDisplay();
  syncCartWithServer(items);
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
      (item) => {
        const isPromo = item.discount && item.discount > 0;
        const finalPrice = isPromo ? item.price * (1 - item.discount / 100) : item.price;
        return `
        <div class="cart-item">
            <img src="${item.image || fallbackImage}" class="cart-item-img" alt="${item.title}" onerror="this.src='${fallbackImage}'">
            <div style="flex: 1">
                <h4 style="font-size: 0.9rem; margin-bottom: 5px;">${item.title}</h4>
                <p style="color: var(--secondary); font-weight: 700;">
                    ${isPromo ? `<span style="text-decoration: line-through; color: var(--text-muted); font-size: 0.8rem; margin-inline-end: 8px;">${Number(item.price).toFixed(2)}$</span>` : ""}
                    ${Number(finalPrice || 0).toFixed(2)}$
                </p>
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
    `;
      }
    )
    .join("");

  const total = cartItems.reduce(
    (acc, item) => {
      const isPromo = item.discount && item.discount > 0;
      const finalPrice = isPromo ? item.price * (1 - item.discount / 100) : item.price;
      return acc + Number(finalPrice || 0) * (item.quantity || 1);
    },
    0,
  );

  if (footer) {
    footer.style.display = "block";
    footer.innerHTML = `
      <div class="total-section">
        <span>المجموع:</span>
        <span id="cartTotal">${total.toFixed(2)}$</span>
      </div>
      <button class="checkout-btn" onclick="goToCartStep2(event)">
        الانتقال للدفع 💳
      </button>
    `;
  }
  if (typeof lucide !== "undefined") lucide.createIcons();
};

const removeFromCartStatic = (id, size) => {
  removeCartItem(id, size);
  renderCart();
};

const changeCartItemQuantity = async (id, size, delta) => {
  const normalized = normalizeSize(size);
  const cartItems = getCartItems();
  const item = cartItems.find(
    (i) => i.id == id && normalizeSize(i.size) === normalized,
  );
  if (!item) return;

  try {
    const res = await fetch("/api/products");
    const products = await res.json();
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
  } catch (err) {
    console.error("Failed to update cart quantity:", err);
  }
};

const addToCart = async (event, id) => {
  const button = event?.currentTarget || event?.target;
  if (button) {
    button.disabled = true;
    button.classList.add("loading");
    button.innerHTML = "جاري الإضافة...";
  }

  try {
    const res = await fetch("/api/products");
    const products = await res.json();
    const product = products.find((p) => p.id == id);
    if (!product) {
      if (button) {
        button.disabled = false;
        button.classList.remove("loading");
        button.innerHTML = "أضف للسلة";
      }
      return;
    }

    const size = getSelectedSize(product);
    const cartItems = getCartItems();
    const existing = cartItems.find(
      (item) => item.id == id && normalizeSize(item.size) === size,
    );
    const currentQuantityInCart = existing ? existing.quantity || 0 : 0;
    const availableQty = parseInt(product.quantity || 0, 10);
    if (currentQuantityInCart + 1 > availableQty) {
      if (button) {
        button.disabled = false;
        button.classList.remove("loading");
        button.innerHTML = "أضف للسلة";
      }
      return showToast("لا توجد كمية كافية في المخزون لإضافة هذا المنتج");
    }

    addCartItem({ ...product, size });
    updateCartDisplay();
    showToast(`تمت الإضافة إلى السلة بنجاح! ${size ? `الحجم ${size}` : ""} 🛒`);
    
    // Automatically open the cart drawer for a premium UX
    const cartOverlay = document.getElementById("cartOverlay");
    if (cartOverlay) {
      renderCart();
      cartOverlay.style.display = "flex";
    }
  } catch (err) {
    console.error("Failed to add to cart:", err);
    alert("حدث خطأ أثناء الإضافة للسلة: " + err.message);
  } finally {
    if (button) {
      setTimeout(() => {
        button.disabled = false;
        button.classList.remove("loading");
        button.innerHTML = "أضف للسلة";
      }, 400);
    }
  }
};

// Database Shared Helpers
const fetchCategories = async () => {
  try {
    const res = await fetch("/api/categories");
    return await res.json();
  } catch (err) {
    console.error("Failed to fetch categories:", err);
    return [];
  }
};

const fetchOrders = async (username = null) => {
  try {
    const url = username ? `/api/orders?username=${encodeURIComponent(username)}` : "/api/orders";
    const response = await fetch(url);
    return response.ok ? await response.json() : [];
  } catch (err) {
    console.error("Failed to fetch orders:", err);
    return [];
  }
};

const fetchProducts = async () => {
  try {
    const res = await fetch("/api/products");
    return await res.json();
  } catch (err) {
    console.error("Failed to fetch products:", err);
    return [];
  }
};

// UI Initialization
document.addEventListener("DOMContentLoaded", () => {
  if (typeof lucide !== "undefined") {
    lucide.createIcons();
  }

  // Mouse cursor follower logic
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

  // Section reveal animations
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

  updateAuthDisplay();
  fetchAndMergeCart().then(() => {
    updateCartDisplay();
    if (document.getElementById("cartOverlay")?.style.display === "flex") {
      renderCart();
    }
  });

  const loader = document.getElementById("loader");
  if (loader) {
    setTimeout(() => (loader.style.display = "none"), 500);
  }

  // Main Nav scroll effect
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

  // Cart Drawer open/close
  const cartOverlay = document.getElementById("cartOverlay");
  document.addEventListener("click", (e) => {
    const cartBtn = e.target.closest("#cartBtn");
    const closeCart = e.target.closest("#closeCart");
    if (cartBtn) {
      if (cartOverlay) {
        renderCart();
        cartOverlay.style.display = "flex";
      } else {
        window.location.href = "shop.html?openCart=true";
      }
    } else if (closeCart && cartOverlay) {
      cartOverlay.style.display = "none";
    } else if (e.target === cartOverlay) {
      cartOverlay.style.display = "none";
    }
  });
});

// 2-Step Cart Drawer Step Management
let currentCartStep = 1;

const PALESTINE_CITIES = [
  { name: "القدس", shipping: 10 },
  { name: "رام الله", shipping: 5 },
  { name: "نابلس", shipping: 5 },
  { name: "الخليل", shipping: 7 },
  { name: "جنين", shipping: 7 },
  { name: "طولكرم", shipping: 6 },
  { name: "قلقيلية", shipping: 6 },
  { name: "بيت لحم", shipping: 6 },
  { name: "أريحا", shipping: 8 },
  { name: "سلفيت", shipping: 6 },
  { name: "طوباس", shipping: 7 },
  { name: "غزة", shipping: 10 }
];

const goToCartStep2 = (event) => {
  const user = getLoggedInUser();
  if (!user) {
    if (confirm("يجب تسجيل الدخول لإتمام الشراء. هل تريد الذهاب إلى صفحة تسجيل الدخول الآن؟")) {
      window.location.href = "login.html";
    }
    return;
  }
  currentCartStep = 2;
  renderCartStep2();
};

const renderCartStep2 = () => {
  const container = document.getElementById("cartContent");
  const footer = document.getElementById("cartFooter");
  if (!container) return;

  // Change sidebar header if available
  const sidebar = container.closest(".cart-sidebar");
  if (sidebar) {
    const headerTitle = sidebar.querySelector(".cart-header h2");
    if (headerTitle) headerTitle.innerHTML = `<span onclick="goBackToStep1()" style="cursor:pointer; color:var(--primary); font-size:0.95rem; margin-left:12px;">← سلة</span> معلومات الدفع والتوصيل`;
  }

  const cartItems = getCartItems();
  const subtotal = cartItems.reduce((acc, item) => {
    const isPromo = item.discount && item.discount > 0;
    const finalPrice = isPromo ? item.price * (1 - item.discount / 100) : item.price;
    return acc + Number(finalPrice) * (item.quantity || 1);
  }, 0);

  container.innerHTML = `
    <div class="checkout-form-step" style="text-align: right; display: flex; flex-direction: column; gap: 15px;">
      <div>
        <label style="display: block; margin-bottom: 6px; font-weight: 700;">اسم المستلم بالكامل <span style="color:#ef4444">*</span></label>
        <input id="checkoutRecipientName" class="input-field" type="text" placeholder="الاسم الكامل للمستلم" style="width:100%; margin:0;" required>
      </div>

      <div>
        <label style="display: block; margin-bottom: 6px; font-weight: 700;">المدينة <span style="color:#ef4444">*</span></label>
        <select id="checkoutCity" class="input-field" onchange="updateShippingFee()" style="width:100%; margin:0; background:var(--bg-surface-light);" required>
          <option value="">-- اختر مدينة التوصيل --</option>
          ${PALESTINE_CITIES.map(c => `<option value="${c.name}">${c.name}</option>`).join("")}
        </select>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div>
          <label style="display: block; margin-bottom: 6px; font-weight: 700;">المنطقة / الحي <span style="color:#ef4444">*</span></label>
          <input id="checkoutArea" class="input-field" type="text" placeholder="مثال: المصايف" style="width:100%; margin:0;" required>
        </div>
        <div>
          <label style="display: block; margin-bottom: 6px; font-weight: 700;">اسم الشارع <span style="color:#ef4444">*</span></label>
          <input id="checkoutStreet" class="input-field" type="text" placeholder="اسم الشارع أو المعلم" style="width:100%; margin:0;" required>
        </div>
      </div>

      <div>
        <label style="display: block; margin-bottom: 6px; font-weight: 700;">رقم الهاتف الجوال <span style="color:#ef4444">*</span></label>
        <input id="checkoutPhone" class="input-field" type="tel" maxlength="15" placeholder="مثال: +970599XXXXXX" style="width:100%; margin:0;" required>
        <p id="checkoutPhoneError" style="color: #ef4444; margin-top: 4px; display: none; font-size: 0.85rem;"></p>
      </div>

      <div>
        <label style="display: block; margin-bottom: 6px; font-weight: 700;">موقع الخريطة <span style="color:var(--text-muted); font-weight:normal;">(اختياري)</span></label>
        <div style="display: flex; gap: 10px; align-items: center;">
          <button class="add-btn" type="button" onclick="openMapPicker()" style="margin:0; padding:10px; font-size:0.85rem; background:var(--bg-surface-light); border:1px solid var(--glass-border); flex:1;">📍 تحديد الموقع على الخريطة</button>
          <input type="hidden" id="checkoutMapCoordinates">
        </div>
        <p id="mapSelectionStatus" style="font-size:0.8rem; color:var(--text-muted); margin-top:4px;"></p>
      </div>

      <div>
        <label style="display: block; margin-bottom: 6px; font-weight: 700;">ملاحظات إضافية</label>
        <textarea id="checkoutNotes" class="input-field" rows="2" placeholder="أي تفاصيل أخرى تسهل الوصول" style="width:100%; margin:0; resize:vertical;"></textarea>
      </div>

      <div>
        <label style="display: block; margin-bottom: 8px; font-weight: 700;">طريقة الدفع <span style="color:#ef4444">*</span></label>
        <div style="display: flex; gap: 14px;">
          <label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="radio" name="paymentMethod" value="كاش عند الاستلام" checked> كاش</label>
          <label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="radio" name="paymentMethod" value="PayPal"> PayPal</label>
          <label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="radio" name="paymentMethod" value="Visa"> Visa</label>
        </div>
      </div>
    </div>
  `;

  if (footer) {
    footer.style.display = "block";
    footer.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 15px; font-size: 0.95rem; text-align: right;">
        <div style="display:flex; justify-content:space-between;"><span>سعر المنتجات:</span><span>${subtotal.toFixed(2)}$</span></div>
        <div style="display:flex; justify-content:space-between;"><span>تكلفة الشحن:</span><span id="shippingDisplay">0.00$</span></div>
        <hr style="border-color: var(--glass-border);">
        <div style="display:flex; justify-content:space-between; font-weight: 700; font-size:1.15rem; color: var(--secondary);">
          <span>المجموع الكلي:</span>
          <span id="grandTotalDisplay">${subtotal.toFixed(2)}$</span>
        </div>
      </div>
      <button class="checkout-btn" onclick="checkoutCart(event)">
        تأكيد الطلب والدفع
      </button>
    `;
  }
};

const goBackToStep1 = () => {
  currentCartStep = 1;
  const container = document.getElementById("cartContent");
  const footer = document.getElementById("cartFooter");
  if (!container) return;

  const sidebar = container.closest(".cart-sidebar");
  if (sidebar) {
    const headerTitle = sidebar.querySelector(".cart-header h2");
    if (headerTitle) headerTitle.innerText = "سلة المشتريات";
  }

  // Restore Step 1 footer
  if (footer) {
    footer.innerHTML = `
      <div class="total-section">
        <span>المجموع:</span>
        <span id="cartTotal">0$</span>
      </div>
      <button class="checkout-btn" onclick="goToCartStep2(event)">
        الانتقال للدفع 💳
      </button>
    `;
  }
  renderCart();
};

const updateShippingFee = () => {
  const city = document.getElementById("checkoutCity")?.value;
  const cartItems = getCartItems();
  const subtotal = cartItems.reduce((acc, item) => {
    const isPromo = item.discount && item.discount > 0;
    const finalPrice = isPromo ? item.price * (1 - item.discount / 100) : item.price;
    return acc + Number(finalPrice) * (item.quantity || 1);
  }, 0);

  const cityInfo = PALESTINE_CITIES.find(c => c.name === city);
  const shippingCost = cityInfo ? cityInfo.shipping : 0;
  const grandTotal = subtotal + shippingCost;

  const shippingDisplay = document.getElementById("shippingDisplay");
  if (shippingDisplay) shippingDisplay.innerText = `${shippingCost.toFixed(2)}$`;

  const grandTotalDisplay = document.getElementById("grandTotalDisplay");
  if (grandTotalDisplay) grandTotalDisplay.innerText = `${grandTotal.toFixed(2)}$`;
};

// Leaflet Map Integrations
let mapInstance = null;
let mapMarker = null;
let selectedCoordinates = null;

const ensureMapModalExists = () => {
  if (document.getElementById("mapPickerModal")) return;
  const modal = document.createElement("div");
  modal.id = "mapPickerModal";
  modal.className = "modal-overlay";
  modal.style.display = "none";
  modal.innerHTML = `
    <div class="modal-card glass" style="max-width: 600px; height: 500px;">
      <div class="modal-header">
        <h3>📍 حدد موقع التوصيل على الخريطة</h3>
        <button class="close-btn" onclick="closeMapPickerModal()">&times;</button>
      </div>
      <div class="modal-body" style="padding: 0; position: relative; height: 100%;">
        <div id="mapPickerDiv" style="width: 100%; height: 100%;"></div>
        <button class="hero-btn" onclick="confirmMapLocation()" style="position: absolute; bottom: 20px; left: 20px; z-index: 1000; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">تأكيد هذا الموقع</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

const loadLeafletMap = (callback) => {
  if (window.L) {
    callback();
    return;
  }
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  document.head.appendChild(link);

  const script = document.createElement("script");
  script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
  script.onload = callback;
  document.head.appendChild(script);
};

const openMapPicker = () => {
  ensureMapModalExists();
  document.getElementById("mapPickerModal").style.display = "flex";
  
  loadLeafletMap(() => {
    setTimeout(() => {
      if (!mapInstance) {
        mapInstance = L.map("mapPickerDiv").setView([31.947, 35.227], 9); // Ramallah / Palestine Center
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap contributors"
        }).addTo(mapInstance);

        mapInstance.on("click", (e) => {
          const { lat, lng } = e.latlng;
          selectedCoordinates = { lat, lng };
          if (mapMarker) {
            mapMarker.setLatLng([lat, lng]);
          } else {
            mapMarker = L.marker([lat, lng]).addTo(mapInstance);
          }
        });
      } else {
        mapInstance.invalidateSize();
      }
    }, 200);
  });
};

const closeMapPickerModal = () => {
  const modal = document.getElementById("mapPickerModal");
  if (modal) modal.style.display = "none";
};

const confirmMapLocation = () => {
  if (selectedCoordinates) {
    const coordsStr = `${selectedCoordinates.lat.toFixed(5)}, ${selectedCoordinates.lng.toFixed(5)}`;
    const mapInput = document.getElementById("checkoutMapCoordinates");
    if (mapInput) {
      mapInput.value = coordsStr;
    }
    const mapStatus = document.getElementById("mapSelectionStatus");
    if (mapStatus) {
      mapStatus.innerText = `📍 تم تحديد الموقع: (${coordsStr})`;
      mapStatus.style.color = "var(--accent)";
    }
    showToast("تم حفظ موقع الخريطة بنجاح");
  }
  closeMapPickerModal();
};

// Matching Outfits Popup Modal
const ensureMatchModalExists = () => {
  if (document.getElementById("matchOutfitModal")) return;
  const modal = document.createElement("div");
  modal.id = "matchOutfitModal";
  modal.className = "modal-overlay";
  modal.style.display = "none";
  modal.innerHTML = `
    <div class="modal-card glass" style="max-width: 680px;">
      <div class="modal-header">
        <h3>👨‍👦 أكمل الإطلالة المتناسقة (طقم الأب والطفل)</h3>
        <button class="close-btn" onclick="closeMatchOutfitModal()">&times;</button>
      </div>
      <div class="modal-body" id="matchOutfitModalBody" style="padding: 24px; overflow-y:auto;">
        <!-- Injected side-by-side -->
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

const showMatchingSet = async (productId, event) => {
  if (event) event.stopPropagation();
  ensureMatchModalExists();
  
  const products = await fetchProducts();
  const product = products.find(p => p.id == productId);
  if (!product) return;

  const matchProduct = products.find(p => p.match_id == product.match_id && p.id != product.id);
  if (!matchProduct) {
    showToast("لم يتم العثور على قطعة مطابقة لهذا الموديل حالياً.");
    return;
  }

  const getProductCardHTML = (p, prefix) => {
    const isPromo = p.discount && p.discount > 0;
    const finalPrice = isPromo ? p.price * (1 - p.discount / 100) : p.price;
    const sizeOptions = p.sizes && p.sizes.length > 0
      ? p.sizes.map(sz => `<option value="${sz}">${sz}</option>`).join("")
      : `<option value="">بدون حجم</option>`;
    
    return `
      <div style="flex: 1; text-align: center; background: rgba(255,255,255,0.03); padding: 16px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.06); min-width: 220px;">
        <img src="${p.image || fallbackImage}" style="width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 12px; margin-bottom: 12px;">
        <h4 style="margin: 0 0 8px; font-size: 0.95rem; color:var(--text-main);">${p.title}</h4>
        <div style="margin-bottom: 12px;">
          ${isPromo ? `<span style="text-decoration: line-through; color: var(--text-muted); font-size: 0.85rem; margin-inline-end: 8px;">${p.price.toFixed(2)}$</span>` : ""}
          <span style="color: var(--secondary); font-weight: 700; font-size: 1.1rem;">${finalPrice.toFixed(2)}$</span>
        </div>
        <label style="display: block; text-align: right; margin-bottom: 6px; font-size: 0.85rem; color: var(--text-muted);">المقاس المتاح:</label>
        <select id="${prefix}_size" class="input-field" style="margin: 0 0 10px 0; padding: 8px 12px; font-size: 0.9rem; border-radius: 8px; background: rgba(255,255,255,0.05); width: 100%;">
          ${sizeOptions}
        </select>
      </div>
    `;
  };

  const modalBody = document.getElementById("matchOutfitModalBody");
  modalBody.innerHTML = `
    <div style="display: flex; gap: 20px; flex-wrap: wrap; justify-content:center;">
      ${getProductCardHTML(product, "p1")}
      <div style="display: flex; align-items: center; justify-content: center; font-size: 2.2rem; color: var(--secondary);">👨‍👦</div>
      ${getProductCardHTML(matchProduct, "p2")}
    </div>
    <div style="margin-top: 24px; text-align: center; background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.2); padding: 14px; border-radius: 12px;">
      <p style="margin: 0; font-weight: 700; color: var(--secondary); font-size: 0.95rem;">🎉 عرض مطابقة الأناقة: وفّر 5% إضافية عند شراء القطعتين للأب والابن معاً!</p>
    </div>
    <button class="hero-btn" onclick="addMatchingOutfitToCart(${product.id}, ${matchProduct.id})" style="width: 100%; margin-top: 20px; padding: 14px;">أضف الطقم المتطابق للسلة بالخصم</button>
  `;

  document.getElementById("matchOutfitModal").style.display = "flex";
};

const closeMatchOutfitModal = () => {
  const modal = document.getElementById("matchOutfitModal");
  if (modal) modal.style.display = "none";
};

const addMatchingOutfitToCart = async (p1Id, p2Id) => {
  const products = await fetchProducts();
  const p1 = products.find(p => p.id == p1Id);
  const p2 = products.find(p => p.id == p2Id);
  if (!p1 || !p2) return;

  const p1Size = document.getElementById("p1_size")?.value || "";
  const p2Size = document.getElementById("p2_size")?.value || "";

  const addDiscountedItem = (p, size) => {
    const isPromo = p.discount && p.discount > 0;
    const basePrice = isPromo ? p.price * (1 - p.discount / 100) : p.price;
    const finalPriceWithCombo = basePrice * 0.95; // 5% discount
    addCartItem({
      ...p,
      price: finalPriceWithCombo,
      size: size
    });
  };

  addDiscountedItem(p1, p1Size);
  addDiscountedItem(p2, p2Size);

  closeMatchOutfitModal();
  updateCartDisplay();
  showToast("👨‍👦 تم إضافة الطقم الكامل بخصم 5% إضافي للسلة!");
  renderCart();
};

const checkoutCart = async (event) => {
  const button = event?.currentTarget || event?.target;
  if (button) {
    button.disabled = true;
    button.classList.add("loading");
    button.innerHTML = "جاري تأكيد الطلب...";
  }

  const cartItems = getCartItems();
  const user = getLoggedInUser();
  if (cartItems.length === 0) {
    showToast("السلة فارغة، أضف منتجات أولاً");
    if (button) {
      button.disabled = false;
      button.classList.remove("loading");
      button.innerHTML = "تأكيد الطلب والدفع";
    }
    return;
  }

  const recipientName = document.getElementById("checkoutRecipientName")?.value.trim();
  const city = document.getElementById("checkoutCity")?.value;
  const area = document.getElementById("checkoutArea")?.value.trim();
  const street = document.getElementById("checkoutStreet")?.value.trim();
  const phone = document.getElementById("checkoutPhone")?.value.trim();
  const notes = document.getElementById("checkoutNotes")?.value.trim() || "";
  const coordinates = document.getElementById("checkoutMapCoordinates")?.value || "";
  const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked')?.value || "كاش عند الاستلام";

  const phoneError = document.getElementById("checkoutPhoneError");
  if (phoneError) phoneError.style.display = "none";

  if (!recipientName || !city || !area || !street || !phone) {
    showToast("الرجاء تعبئة كافة الحقول الإجبارية المعلمة بـ *");
    if (button) {
      button.disabled = false;
      button.classList.remove("loading");
      button.innerHTML = "تأكيد الطلب والدفع";
    }
    return;
  }

  const normalizedPhone = phone.replace(/\s+/g, "");
  const phoneValid = /^\+?\d{7,15}$/.test(normalizedPhone);
  if (!phoneValid) {
    if (phoneError) {
      phoneError.innerText = "رقم الهاتف غير صالح. يجب أن يحتوي على أرقام فقط (7-15 خانة) ويمكن أن يبدأ بـ +.";
      phoneError.style.display = "block";
    }
    showToast("الرجاء إدخال رقم هاتف جوال صالح");
    if (button) {
      button.disabled = false;
      button.classList.remove("loading");
      button.innerHTML = "تأكيد الطلب والدفع";
    }
    return;
  }

  // Double check and apply final discounted prices
  const orderItems = cartItems.map((item) => {
    const isPromo = item.discount && item.discount > 0;
    const finalPrice = isPromo ? item.price * (1 - item.discount / 100) : item.price;
    return {
      id: item.id,
      title: item.title,
      quantity: item.quantity || 1,
      size: item.size || "",
      price: Number(finalPrice.toFixed(2)),
      original_price: Number(item.price.toFixed(2)),
      discount: item.discount || 0,
      image: item.image || ""
    };
  });

  const subtotal = cartItems.reduce((acc, item) => {
    const isPromo = item.discount && item.discount > 0;
    const finalPrice = isPromo ? item.price * (1 - item.discount / 100) : item.price;
    return acc + Number(finalPrice) * (item.quantity || 1);
  }, 0);

  const cityInfo = PALESTINE_CITIES.find(c => c.name === city);
  const shippingCost = cityInfo ? cityInfo.shipping : 0;
  const grandTotal = subtotal + shippingCost;
  const orderId = `TRK-${Math.floor(1000 + Math.random() * 9000)}`;

  // Store the detailed structured address as a robust JSON string in the address column
  const addressJSON = JSON.stringify({
    recipient: recipientName,
    city,
    area,
    street,
    notes,
    coordinates
  });

  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: orderId,
        name: user.username,
        email: user.email || "",
        phone: normalizedPhone,
        address: addressJSON,
        items: orderItems,
        status: "تم استلام الطلب",
        total: grandTotal.toFixed(2),
        payment_status: paymentMethod === "كاش عند الاستلام" ? "لم يتم الدفع" : "مدفوع",
        payment_method: paymentMethod,
        shipping_cost: shippingCost
      }),
    });

    if (response.ok) {
      saveCartItems([]);
      await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user.username, items: [] }),
      });
      localStorage.setItem("cartCount", "0");
      updateCartDisplay();
      currentCartStep = 1;
      goBackToStep1();
      
      const cartOverlay = document.getElementById("cartOverlay");
      if (cartOverlay) cartOverlay.style.display = "none";
      
      showToast(`تم إنشاء الطلب بنجاح برقم: ${orderId}`);
      setTimeout(() => {
        if (button) {
          button.disabled = false;
          button.classList.remove("loading");
          button.innerHTML = "تأكيد الطلب والدفع";
        }
        window.location.href = `track.html?order=${orderId}`;
      }, 1200);
    } else {
      showToast("حدث خطأ أثناء إرسال الطلب للخادم");
      if (button) {
        button.disabled = false;
        button.classList.remove("loading");
        button.innerHTML = "تأكيد الطلب والدفع";
      }
    }
  } catch (err) {
    console.error("Order request failed:", err);
    showToast("فشل الاتصال بالخادم");
    if (button) {
      button.disabled = false;
      button.classList.remove("loading");
      button.innerHTML = "تأكيد الطلب والدفع";
    }
  }
};

// Run checking for query parameter openCart
document.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("openCart") === "true") {
    const cartOverlay = document.getElementById("cartOverlay");
    if (cartOverlay) {
      renderCart();
      cartOverlay.style.display = "flex";
    }
  }
});

// Bind to window for HTML inline event handlers
window.logout = logout;
window.addToCart = addToCart;
window.changeCartItemQuantity = changeCartItemQuantity;
window.removeFromCartStatic = removeFromCartStatic;
window.showToast = showToast;
window.fetchCategories = fetchCategories;
window.fetchProducts = fetchProducts;
window.checkoutCart = checkoutCart;
window.fetchAndMergeCart = fetchAndMergeCart;
window.goToCartStep2 = goToCartStep2;
window.goBackToStep1 = goBackToStep1;
window.updateShippingFee = updateShippingFee;
window.openMapPicker = openMapPicker;
window.closeMapPickerModal = closeMapPickerModal;
window.confirmMapLocation = confirmMapLocation;
window.showMatchingSet = showMatchingSet;
window.closeMatchOutfitModal = closeMatchOutfitModal;
window.addMatchingOutfitToCart = addMatchingOutfitToCart;
