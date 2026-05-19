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
window.fetch = function (input, init) {
  if (typeof input === "string" && input.startsWith("/api/")) {
    input = API_BASE_URL + input;
  }
  return originalFetch(input, init);
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
    const product = products.find((p) => p.id === id);
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
    if (currentQuantityInCart + 1 > (product.quantity || 0)) {
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
  } catch (err) {
    console.error("Failed to add to cart:", err);
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
    if (cartBtn && cartOverlay) {
      renderCart();
      cartOverlay.style.display = "flex";
    } else if (closeCart && cartOverlay) {
      cartOverlay.style.display = "none";
    } else if (e.target === cartOverlay) {
      cartOverlay.style.display = "none";
    }
  });
});

const checkoutCart = async (event) => {
  const button = event?.currentTarget || event?.target;
  if (button) {
    button.disabled = true;
    button.classList.add("loading");
    button.innerHTML = "جاري إتمام الطلب...";
  }

  const cartItems = getCartItems();
  const user = getLoggedInUser();
  if (cartItems.length === 0) {
    showToast("السلة فارغة، أضف منتجات أولاً لإتمام الشراء");
    if (button) {
      button.disabled = false;
      button.classList.remove("loading");
      button.innerHTML = "إتمام الشراء";
    }
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
    if (button) {
      button.disabled = false;
      button.classList.remove("loading");
      button.innerHTML = "إتمام الشراء";
    }
    return;
  }

  const addressInput = document.getElementById("checkoutAddress");
  const phoneInput = document.getElementById("checkoutPhone");
  const addressError = document.getElementById("checkoutAddressError");
  const phoneError = document.getElementById("checkoutPhoneError");
  const address = addressInput ? addressInput.value.trim() : "";
  const phone = phoneInput ? phoneInput.value.trim() : "";

  if (addressError) addressError.style.display = "none";
  if (phoneError) phoneError.style.display = "none";

  if (!address) {
    if (addressError) {
      addressError.innerText = "الرجاء إدخال عنوان التوصيل لإتمام الطلب.";
      addressError.style.display = "block";
      addressInput?.focus();
    }
    showToast("الرجاء إدخال عنوان التوصيل لإتمام الطلب");
    if (button) {
      button.disabled = false;
      button.classList.remove("loading");
      button.innerHTML = "إتمام الشراء";
    }
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
    if (button) {
      button.disabled = false;
      button.classList.remove("loading");
      button.innerHTML = "إتمام الشراء";
    }
    return;
  }

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

  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: orderId,
        name: user.username,
        email: user.email || "",
        phone: normalizedPhone,
        address,
        items: orderItems,
        status: "تم استلام الطلب",
        total: total.toFixed(2),
      }),
    });

    if (response.ok) {
      saveCartItems([]);
      if (addressInput) addressInput.value = "";
      if (phoneInput) phoneInput.value = "";
      localStorage.setItem("cartCount", "0");
      updateCartDisplay();
      renderCart();
      showToast(
        `تم إنشاء الطلب: ${orderId}، يمكنك تتبعه الآن عبر رقم الطلب أو رقم الجوال.`,
      );
      setTimeout(() => {
        if (button) {
          button.disabled = false;
          button.classList.remove("loading");
          button.innerHTML = "إتمام الشراء";
        }
        window.location.href = `track.html?order=${orderId}`;
      }, 1200);
    } else {
      showToast("حدث خطأ أثناء إرسال الطلب للخادم");
      if (button) {
        button.disabled = false;
        button.classList.remove("loading");
        button.innerHTML = "إتمام الشراء";
      }
    }
  } catch (err) {
    console.error("Order request failed:", err);
    showToast("فشل الاتصال بالخادم");
    if (button) {
      button.disabled = false;
      button.classList.remove("loading");
      button.innerHTML = "إتمام الشراء";
    }
  }
};

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
