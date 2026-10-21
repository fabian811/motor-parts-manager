"use strict";

(() => {
  const DB_NAME = "motor-parts-manager";
  const DB_VERSION = 1;
  const STORE_NAMES = ["users", "products", "sales", "saleItems", "movements", "notifications", "settings"];
  const Domain = globalThis.MotorPartsDomain;
  const SUPPORT_EMAIL = "[YOUR_SUPPORT_EMAIL@example.com]";
  const CURRENCY = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
  const DATE_TIME = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short", hour12: true
  });
  const DATE_ONLY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
  const NAV = [
    ["dashboard", "⌂", "Dashboard"], ["inventory", "▦", "Inventory"], ["sales", "＋", "New sale"],
    ["history", "◷", "Sales history"], ["reports", "▤", "Reports"], ["notifications", "♢", "Notifications"],
    ["settings", "⚙", "Settings"]
  ];
  const state = { db: null, user: null, page: "dashboard", query: "", cart: [], historyFilter: "today", renderVersion: 0, saleSubmitting: false, lockTimeoutMs: 0 };
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const authRoot = $("#auth");
  const appRoot = $("#app");
  const content = $("#content");
  const dialogRoot = $("#dialog-root");
  let idleTimer = null;

  function money(value) { return CURRENCY.format(Number(value || 0)); }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch]));
  }
  function localDateString(epoch = Date.now()) { return DATE_ONLY.format(new Date(epoch)); }
  function istMidnightEpoch(dateString) {
    const [year, month, day] = dateString.split("-").map(Number);
    return Date.UTC(year, month - 1, day) - (5 * 60 + 30) * 60 * 1000;
  }
  function istEndEpoch(dateString) { return istMidnightEpoch(dateString) + 24 * 60 * 60 * 1000 - 1; }
  function istDateTime(value) { return DATE_TIME.format(new Date(Number(value))); }
  function todayDate() { return localDateString(); }
  function uid(prefix = "id") { return `${prefix}-${crypto.randomUUID()}`; }
  function toast(message, error = false) {
    const node = document.createElement("div");
    node.className = `toast${error ? " error" : ""}`;
    node.textContent = message;
    $("#toast-region").append(node);
    setTimeout(() => node.remove(), 3800);
  }
  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = event => {
        const db = request.result;
        const upgrade = event.target.transaction;
        const stores = {};
        for (const name of STORE_NAMES) {
          stores[name] = db.objectStoreNames.contains(name)
            ? upgrade.objectStore(name)
            : db.createObjectStore(name, { keyPath: "id" });
        }
        if (!stores.users.indexNames.contains("email")) stores.users.createIndex("email", "email", { unique: true });
        if (!stores.products.indexNames.contains("internalProductId")) stores.products.createIndex("internalProductId", "internalProductId", { unique: true });
        if (!stores.sales.indexNames.contains("saleNumber")) stores.sales.createIndex("saleNumber", "saleNumber", { unique: true });
        if (!stores.sales.indexNames.contains("timestamp")) stores.sales.createIndex("timestamp", "timestamp");
        if (!stores.saleItems.indexNames.contains("saleId")) stores.saleItems.createIndex("saleId", "saleId");
        if (!stores.saleItems.indexNames.contains("productId")) stores.saleItems.createIndex("productId", "productId");
        if (!stores.movements.indexNames.contains("productId")) stores.movements.createIndex("productId", "productId");
        if (!stores.movements.indexNames.contains("timestamp")) stores.movements.createIndex("timestamp", "timestamp");
        if (!stores.notifications.indexNames.contains("createdAt")) stores.notifications.createIndex("createdAt", "createdAt");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open the local database."));
      request.onblocked = () => reject(new Error("Database upgrade is blocked by another open app tab. Close the other tab and retry."));
    });
  }
  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Database operation failed."));
    });
  }
  function transactionDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Database transaction failed."));
      tx.onabort = () => reject(tx.error || new Error("Database transaction was cancelled."));
    });
  }
  async function all(storeName) {
    const tx = state.db.transaction(storeName, "readonly");
    const result = await requestResult(tx.objectStore(storeName).getAll());
    await transactionDone(tx);
    return result;
  }
  async function get(storeName, id) {
    const tx = state.db.transaction(storeName, "readonly");
    const result = await requestResult(tx.objectStore(storeName).get(id));
    await transactionDone(tx);
    return result;
  }
  async function save(storeName, value) {
    const tx = state.db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    await transactionDone(tx);
    return value;
  }
  async function remove(storeName, id) {
    const tx = state.db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(id);
    await transactionDone(tx);
  }
  async function setting(key, fallback = null) {
    const row = await get("settings", key);
    return row ? row.value : fallback;
  }
  async function setSetting(key, value) {
    await save("settings", { id: key, value });
  }
  async function hashPassword(password, saltText) {
    const salt = saltText ? Uint8Array.from(atob(saltText), c => c.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16));
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 180000, hash: "SHA-256" }, material, 256);
    return { salt: btoa(String.fromCharCode(...salt)), hash: btoa(String.fromCharCode(...new Uint8Array(bits))) };
  }
  async function createUser(form) {
    const fields = Object.fromEntries(new FormData(form));
    const email = String(fields.email || "").trim().toLowerCase();
    const password = String(fields.password || "");
    if (!fields.name || !fields.shopName || !email || !fields.phone) throw new Error("Complete all required account fields.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
    if (password.length < 8) throw new Error("Use a password with at least 8 characters.");
    if (password !== fields.confirmPassword) throw new Error("The passwords do not match.");
    if (!fields.terms) throw new Error("Accept the privacy notice and terms to continue.");
    const credential = await hashPassword(password);
    const tx = state.db.transaction("users", "readwrite");
    const users = tx.objectStore("users");
    const existingUsers = await requestResult(users.getAll());
    if (existingUsers.length > 0) {
      tx.abort();
      throw new Error("This browser is configured for one local shop account. Sign in to the existing account; its shop records are shared only with that account.");
    }
    const user = {
      id: uid("user"), name: String(fields.name).trim(), shopName: String(fields.shopName).trim(),
      email, phone: String(fields.phone).trim(), salt: credential.salt, passwordHash: credential.hash,
      createdAt: Date.now()
    };
    users.add(user);
    await transactionDone(tx);
    state.user = user;
    setSession(user.id, true);
  }
  async function authenticate(email, password) {
    const normalized = email.trim().toLowerCase();
    const tx = state.db.transaction("users", "readonly");
    const user = await requestResult(tx.objectStore("users").index("email").get(normalized));
    await transactionDone(tx);
    if (!user) return null;
    const check = await hashPassword(password, user.salt);
    return check.hash === user.passwordHash ? user : null;
  }
  function setSession(userId, remember) {
    sessionStorage.setItem("motor-parts-user", userId);
    if (remember) localStorage.setItem("motor-parts-user", userId);
    else localStorage.removeItem("motor-parts-user");
  }
  function clearSession() {
    clearTimeout(idleTimer);
    state.lockTimeoutMs = 0;
    sessionStorage.removeItem("motor-parts-user");
    sessionStorage.removeItem("motor-parts-last-active");
    localStorage.removeItem("motor-parts-user");
    state.user = null;
  }
  async function restoreSession() {
    const id = sessionStorage.getItem("motor-parts-user") || localStorage.getItem("motor-parts-user");
    if (!id) return;
    state.user = await get("users", id);
    if (!state.user) clearSession();
  }
  function renderAuth(mode = "login", message = "") {
    appRoot.hidden = true;
    authRoot.hidden = false;
    const isRegister = mode === "register";
    authRoot.innerHTML = `<div class="auth-card">
      <a class="brand" href="#"><span class="brand-mark">MP</span><span><strong>Motor Parts</strong><small>MANAGER</small></span></a>
      <h1>${isRegister ? "Create your shop account" : "Welcome back"}</h1>
      <p class="auth-intro">${isRegister ? "Your shop data stays in this browser and works offline." : "Sign in to manage your shop locally, even without internet."}</p>
      ${message ? `<div class="notice danger-notice" role="alert">${escapeHtml(message)}</div><br>` : ""}
      <form id="${isRegister ? "register-form" : "login-form"}" class="auth-fields">
        ${isRegister ? `<div class="field"><label for="reg-name">Shopkeeper name *</label><input class="input" id="reg-name" name="name" required autocomplete="name"></div>
          <div class="field"><label for="reg-shop">Shop name *</label><input class="input" id="reg-shop" name="shopName" required></div>
          <div class="field"><label for="reg-email">Email *</label><input class="input" id="reg-email" name="email" type="email" required autocomplete="email"></div>
          <div class="field"><label for="reg-phone">Phone *</label><input class="input" id="reg-phone" name="phone" type="tel" required autocomplete="tel"></div>
          <div class="field"><label for="reg-password">Password (8+ characters) *</label><input class="input" id="reg-password" name="password" type="password" minlength="8" required autocomplete="new-password"></div>
          <div class="field"><label for="reg-confirm">Confirm password *</label><input class="input" id="reg-confirm" name="confirmPassword" type="password" required autocomplete="new-password"></div>
          <label class="inline-check small-text"><input type="checkbox" name="terms" required> I understand data is stored only in this browser. <button type="button" data-action="privacy">Privacy notice</button></label>` :
          `<div class="field"><label for="login-email">Email address</label><input class="input" id="login-email" name="email" type="email" required autocomplete="username"></div>
          <div class="field"><label for="login-password">Password</label><div class="toolbar-group"><input class="input" id="login-password" name="password" type="password" required autocomplete="current-password"><button class="button secondary small" type="button" data-action="toggle-password">Show</button></div></div>
          <label class="inline-check small-text"><input type="checkbox" name="remember" checked> Remember me on this device</label>
          <button class="button secondary" type="button" data-action="recovery">Forgot password?</button>`}
        <button class="button" type="submit">${isRegister ? "Create account" : "Sign in"}</button>
      </form>
      <p class="auth-footer">${isRegister ? "Already registered?" : "New to Motor Parts Manager?"}
        <button type="button" data-action="${isRegister ? "login" : "register"}">${isRegister ? "Sign in" : "Create account"}</button>
      </p>
      <p class="auth-footer"><button type="button" data-action="support">Customer support</button></p>
      <p class="small-text muted" style="text-align:center;margin:18px 0 0">Offline-first · Local browser storage · No cloud account</p>
    </div>`;
  }
  async function completeLogin(user, remember) {
    state.user = user;
    setSession(user.id, remember);
    sessionStorage.setItem("motor-parts-last-active", String(Date.now()));
    await applyAppearance();
    await showApp();
    await startLockTimer();
    await checkStockAlerts();
    await maybeDailySummary();
  }
  async function startLockTimer() {
    clearTimeout(idleTimer);
    if (!state.user || appRoot.hidden) return;
    const credential = await setting("appLockCredential", null);
    if (!credential) {
      state.lockTimeoutMs = 0;
      return;
    }
    const minutes = Number(await setting("appLockTimeout", 5));
    state.lockTimeoutMs = Math.max(1, minutes) * 60 * 1000;
    idleTimer = setTimeout(() => renderLock(), state.lockTimeoutMs);
  }
  function recordActivity() {
    if (!state.user || appRoot.hidden || !state.lockTimeoutMs) return;
    sessionStorage.setItem("motor-parts-last-active", String(Date.now()));
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => renderLock(), state.lockTimeoutMs);
  }
  function renderLock(message = "") {
    clearTimeout(idleTimer);
    appRoot.hidden = true;
    authRoot.hidden = false;
    authRoot.innerHTML = `<div class="auth-card"><a class="brand" href="#"><span class="brand-mark">MP</span><span><strong>Motor Parts</strong><small>MANAGER</small></span></a><h1>App locked</h1><p class="auth-intro">Enter your 6-digit app PIN to continue.</p>${message ? `<div class="notice danger-notice">${escapeHtml(message)}</div><br>` : ""}
      <form id="app-lock-form" class="auth-fields"><div class="field"><label for="app-pin">App PIN</label><input class="input" id="app-pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required></div><button class="button" type="submit">Unlock</button></form>
      <p class="auth-footer"><button type="button" data-action="password-sign-in">Use account password instead</button></p></div>`;
    $("#app-pin").focus();
  }
  function renderNavigation() {
    $("#navigation").innerHTML = NAV.map(([id, icon, label]) =>
      `<button type="button" class="nav-button${state.page === id ? " active" : ""}" data-page="${id}"><span>${icon}</span>${label}</button>`
    ).join("");
  }
  async function showApp() {
    authRoot.hidden = true;
    appRoot.hidden = false;
    renderNavigation();
    $("#today-label").textContent = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(new Date());
    const displayName = await setting("shopDisplayName", state.user.shopName);
    const logo = await setting("shopLogo", "");
    $("#user-chip").innerHTML = `${logo ? `<img class="avatar shop-logo" src="${escapeHtml(logo)}" alt="">` : `<span class="avatar">${escapeHtml((state.user.name || "S").slice(0, 1).toUpperCase())}</span>`}<span><strong>${escapeHtml(state.user.name)}</strong><small>${escapeHtml(displayName)}</small></span>`;
    $("#connection-state").textContent = navigator.onLine ? "● Data saved on this device" : "● Offline · local data active";
    $("#page-title").textContent = NAV.find(item => item[0] === state.page)?.[2] || "Dashboard";
    await renderPage();
    updateUnreadBadge();
  }
  function statCard(title, value, note, icon) {
    return `<article class="card stat-card"><div class="stat-head">${title}<span class="stat-icon">${icon}</span></div><div class="stat-value">${value}</div><div class="stat-note">${note}</div></article>`;
  }
  async function todaySummary() {
    const start = istMidnightEpoch(todayDate());
    const end = Date.now();
    const sales = (await all("sales")).filter(row => Domain.isWithinInclusiveRange(row.timestamp, start, end) && row.status === "completed");
    const items = (await all("saleItems")).filter(row => sales.some(sale => sale.id === row.saleId));
    const products = (await all("products")).filter(item => !item.archived);
    return {
      revenue: sales.reduce((sum, row) => sum + row.total, 0),
      transactions: sales.length,
      items: items.reduce((sum, row) => sum + row.quantity, 0),
      types: products.length,
      stock: products.reduce((sum, row) => sum + row.stockQuantity, 0),
      low: products.filter(row => row.stockQuantity > 0 && row.stockQuantity <= row.minStock).length,
      out: products.filter(row => row.stockQuantity === 0).length,
      profit: Domain.grossProfit(sales, items)
    };
  }
  async function renderPage() {
    const renderVersion = ++state.renderVersion;
    $("#page-title").textContent = NAV.find(item => item[0] === state.page)?.[2] || "Dashboard";
    switch (state.page) {
      case "dashboard": return renderDashboard(renderVersion);
      case "inventory": return renderInventory(renderVersion);
      case "sales": return renderSales(renderVersion);
      case "history": return renderHistory(renderVersion);
      case "reports": return renderReports(renderVersion);
      case "notifications": return renderNotifications(renderVersion);
      case "settings": return renderSettings(renderVersion);
      default: state.page = "dashboard"; return renderDashboard(renderVersion);
    }
  }
  async function renderDashboard(renderVersion = ++state.renderVersion) {
    const s = await todaySummary();
    const displayName = await setting("shopDisplayName", state.user.shopName);
    const logo = await setting("shopLogo", "");
    const products = (await all("products")).filter(item => !item.archived);
    const low = products.filter(item => item.stockQuantity <= item.minStock).sort((a, b) => a.stockQuantity - b.stockQuantity).slice(0, 6);
    const recent = (await all("sales")).filter(row => row.status === "completed").sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
    const max = Math.max(1, ...products.map(item => item.stockQuantity));
    if (renderVersion !== state.renderVersion) return;
    content.innerHTML = `${logo ? `<div class="card shop-dashboard-brand"><img src="${escapeHtml(logo)}" alt="" class="shop-logo-large"><strong>${escapeHtml(displayName)}</strong></div>` : `<div class="dashboard-shop-name">${escapeHtml(displayName)}</div>`}<div class="grid stats-grid">
      ${statCard("Sales today", money(s.revenue), "Completed transactions · IST day", "₹")}
      ${statCard("Transactions", s.transactions, "Completed today", "⇄")}
      ${statCard("Items sold", s.items, "Units sold today", "▣")}
      ${statCard("Product types", s.types, "Active inventory", "▦")}
      ${statCard("Units in stock", s.stock, "Current active inventory", "◫")}
      ${statCard("Low stock", s.low, "At or below reorder threshold", "⚠")}
      ${statCard("Out of stock", s.out, "Active products with zero units", "⊘")}
      ${statCard("Est. gross profit", money(s.profit), "Using saved cost snapshots", "↗")}
    </div>
    <div class="grid two-column">
      <div>
        <div class="section-heading"><h2>Low stock watch</h2><button class="button secondary small" data-page="inventory">View inventory</button></div>
        <div class="card table-wrap">${low.length ? `<table><thead><tr><th>Product</th><th>Available</th><th>Minimum</th><th>Status</th></tr></thead><tbody>${low.map(item => `<tr><td><span class="product-primary">${escapeHtml(item.name)}</span><span class="product-secondary">${escapeHtml(item.partNumber || "No part number")}</span></td><td>${item.stockQuantity}</td><td>${item.minStock}</td><td><span class="pill ${item.stockQuantity === 0 ? "out" : "low"}">${item.stockQuantity === 0 ? "Out of stock" : "Restock soon"}</span></td></tr>`).join("")}</tbody></table>` : `<div class="empty-state"><strong>All stocked up</strong>No products are currently low on stock.</div>`}</div>
      </div>
      <div>
        <div class="section-heading"><h2>Quick actions</h2></div>
        <div class="card quick-actions">
          <button class="quick-action" data-action="add-product"><span>＋</span><strong>Add product</strong></button>
          <button class="quick-action" data-page="sales"><span>▣</span><strong>New sale</strong></button>
          <button class="quick-action" data-page="reports"><span>▤</span><strong>Reports</strong></button>
          <button class="quick-action" data-page="notifications"><span>♢</span><strong>Alerts</strong></button>
        </div>
        <div class="section-heading"><h2>Recent sales</h2><button class="button secondary small" data-page="history">History</button></div>
        <div class="card stack">${recent.length ? recent.map(row => `<div class="setting-row"><div class="setting-copy"><strong>${escapeHtml(row.saleNumber)}</strong><small>${istDateTime(row.timestamp)} · ${escapeHtml(row.paymentMethod)}</small></div><strong>${money(row.total)}</strong></div>`).join("") : `<div class="empty-state"><strong>No sales yet</strong>Sales will appear here after your first completed bill.</div>`}</div>
      </div>
    </div>`;
  }
  async function renderInventory(renderVersion = ++state.renderVersion) {
    const query = state.query.trim().toLowerCase();
    const products = (await all("products")).filter(item => !item.archived && (!query || [item.name, item.partNumber, item.brand, item.category, item.compatibleModels, item.internalProductId].some(value => String(value || "").toLowerCase().includes(query)))).sort((a, b) => a.name.localeCompare(b.name));
    if (renderVersion !== state.renderVersion) return;
    content.innerHTML = `<div class="page-toolbar"><div class="toolbar-group"><input id="inventory-search" class="input search-input" placeholder="Search name, brand, part number, vehicle…" value="${escapeHtml(state.query)}" aria-label="Search inventory"></div><div class="toolbar-group"><button class="button secondary" data-action="archived-products">Archived products</button><button class="button" data-action="add-product">＋ Add product</button></div></div>
    <div class="card table-wrap">${products.length ? `<table><thead><tr><th>Product</th><th>Brand / compatible</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th></tr></thead><tbody>${products.map(item => {
      const stockState = Domain.stockStatus(item.stockQuantity, item.minStock);
      return `<tr>
      <td><span class="product-primary">${escapeHtml(item.name)}</span><span class="product-secondary">${escapeHtml(item.internalProductId)} · ${escapeHtml(item.partNumber || "No part number")} · ${escapeHtml(item.category)}</span></td>
      <td>${escapeHtml(item.brand || "—")}<span class="product-secondary">${escapeHtml(item.compatibleModels || "—")}</span></td>
      <td>${money(item.sellingPrice)}<span class="product-secondary">Cost ${money(item.purchasePrice)}</span></td>
      <td><strong>${item.stockQuantity}</strong><span class="product-secondary">Minimum ${item.minStock}</span></td>
      <td><span class="pill ${stockState === "out" ? "out" : stockState === "low" ? "low" : "good"}">${stockState === "out" ? "Out of stock" : stockState === "low" ? "Low stock" : "In stock"}</span></td>
      <td><div class="actions"><button class="button secondary small" data-action="edit-product" data-id="${item.id}">Edit</button><button class="button secondary small" data-action="move-stock" data-id="${item.id}">Stock</button><button class="button secondary small" data-action="archive-product" data-id="${item.id}">Archive</button></div></td>
    </tr>`;
    }).join("")}</tbody></table>` : `<div class="empty-state"><strong>${query ? "No matching products" : "Your inventory is empty"}</strong>${query ? "Try a different search term." : "Add your first product to start tracking stock."}</div>`}</div>`;
    $("#inventory-search").addEventListener("input", async event => {
      const cursor = event.target.selectionStart;
      state.query = event.target.value;
      await renderInventory();
      const input = $("#inventory-search");
      input.focus();
      input.setSelectionRange(cursor, cursor);
    });
  }
  function productForm(product = null) {
    showModal(product ? "Edit product" : "Add a product", `<form id="product-form" class="modal-grid">
      <input type="hidden" name="id" value="${escapeHtml(product?.id || "")}">
      <div class="field"><label>Product name *</label><input class="input" name="name" required value="${escapeHtml(product?.name || "")}"></div>
      <div class="field"><label>Internal product ID *</label><input class="input" name="internalProductId" required value="${escapeHtml(product?.internalProductId || `MP-${Date.now().toString().slice(-7)}`)}"></div>
      <div class="field"><label>Manufacturer part number</label><input class="input" name="partNumber" value="${escapeHtml(product?.partNumber || "")}"></div>
      <div class="field"><label>Brand</label><input class="input" name="brand" value="${escapeHtml(product?.brand || "")}"></div>
      <div class="field"><label>Compatible vehicles</label><input class="input" name="compatibleModels" value="${escapeHtml(product?.compatibleModels || "")}"></div>
      <div class="field"><label>Category</label><input class="input" name="category" value="${escapeHtml(product?.category || "")}"></div>
      <div class="field"><label>Purchase price (₹) *</label><input class="input" name="purchasePrice" type="number" min="0" step="0.01" required value="${product?.purchasePrice ?? ""}"></div>
      <div class="field"><label>Selling price (₹) *</label><input class="input" name="sellingPrice" type="number" min="0" step="0.01" required value="${product?.sellingPrice ?? ""}"></div>
      <div class="field"><label>${product ? "Current stock (use Stock action for corrections)" : "Opening stock"} *</label><input class="input" name="stockQuantity" type="number" min="0" step="1" required value="${product?.stockQuantity ?? 0}" ${product ? "readonly" : ""}></div>
      <div class="field"><label>Minimum stock threshold *</label><input class="input" name="minStock" type="number" min="0" step="1" required value="${product?.minStock ?? 0}"></div>
      <div class="field"><label>Supplier</label><input class="input" name="supplier" value="${escapeHtml(product?.supplier || "")}"></div>
      <div class="field full"><label>Description</label><textarea name="description">${escapeHtml(product?.description || "")}</textarea></div>
      <div class="modal-actions full"><button type="button" class="button secondary" data-action="close-modal">Cancel</button><button class="button" type="submit">Save product</button></div>
    </form>`);
    $("#product-form").addEventListener("submit", async event => {
      event.preventDefault();
      const fields = Object.fromEntries(new FormData(event.currentTarget));
      const purchasePrice = Number(fields.purchasePrice);
      const sellingPrice = Number(fields.sellingPrice);
      const initialQuantity = Number(fields.stockQuantity);
      const threshold = Number(fields.minStock);
      if (![purchasePrice, sellingPrice, initialQuantity, threshold].every(Number.isFinite) || purchasePrice < 0 || sellingPrice < 0 || initialQuantity < 0 || threshold < 0) {
        toast("Prices and quantities must be valid non-negative numbers.", true);
        return;
      }
      const now = Date.now();
      const savedProduct = {
        ...product, id: product?.id || uid("product"), internalProductId: fields.internalProductId.trim(),
        name: fields.name.trim(), partNumber: fields.partNumber.trim(), brand: fields.brand.trim(),
        compatibleModels: fields.compatibleModels.trim(), category: fields.category.trim(),
        purchasePrice, sellingPrice, stockQuantity: product?.stockQuantity ?? initialQuantity,
        minStock: threshold, supplier: fields.supplier.trim(), description: fields.description.trim(),
        dateAdded: product?.dateAdded || now, archived: false
      };
      try {
        const existing = (await all("products")).find(row => row.internalProductId.toLowerCase() === savedProduct.internalProductId.toLowerCase() && row.id !== savedProduct.id);
        if (existing) throw new Error("Internal product ID must be unique.");
        const tx = state.db.transaction(["products", "movements"], "readwrite");
        tx.objectStore("products").put(savedProduct);
        if (!product && initialQuantity > 0) tx.objectStore("movements").add({
          id: uid("move"), productId: savedProduct.id, type: "opening", quantity: initialQuantity,
          reason: "Opening stock", timestamp: now, unitCost: purchasePrice, actor: state.user.id
        });
        await transactionDone(tx);
        closeModal();
        toast(product ? "Product updated." : "Product added.");
        await renderPage();
        await checkProductAlert(savedProduct);
      } catch (error) { toast(error.message || "Could not save product.", true); }
    });
  }
  async function stockForm(productId) {
    const product = await get("products", productId);
    if (!product) return toast("Product not found.", true);
    showModal("Record stock movement", `<div class="notice">Current available stock: <strong>${product.stockQuantity}</strong></div><br>
      <form id="stock-form" class="modal-grid">
      <div class="field"><label>Movement type</label><select class="input" name="type"><option value="received">Stock received</option><option value="return">Customer return (restock)</option><option value="damaged">Damaged / lost (remove)</option><option value="correction">Stock correction</option></select></div>
      <div class="field"><label>Quantity *</label><input class="input" name="quantity" type="number" min="1" step="1" required></div>
      <div class="field"><label>Reason *</label><input class="input" name="reason" required placeholder="Supplier delivery, damage…"></div>
      <div class="field"><label>Unit cost (₹), if restocked</label><input class="input" name="unitCost" type="number" min="0" step="0.01" value="${product.purchasePrice}"></div>
      <div class="modal-actions full"><button type="button" class="button secondary" data-action="close-modal">Cancel</button><button class="button" type="submit">Save movement</button></div></form>`);
    $("#stock-form").addEventListener("submit", async event => {
      event.preventDefault();
      const fields = Object.fromEntries(new FormData(event.currentTarget));
      const quantity = Number(fields.quantity);
      const adding = fields.type === "received" || fields.type === "return";
      const adjustment = fields.type === "correction" ? quantity : adding ? quantity : -quantity;
      if (!Number.isInteger(quantity) || quantity < 1 || product.stockQuantity + adjustment < 0) return toast("Quantity must be a whole number and cannot make stock negative.", true);
      try {
        const tx = state.db.transaction(["products", "movements"], "readwrite");
        const products = tx.objectStore("products");
        const current = await requestResult(products.get(product.id));
        if (!current || current.stockQuantity + adjustment < 0) throw new Error("Available stock changed. Refresh and retry.");
        current.stockQuantity += adjustment;
        products.put(current);
        tx.objectStore("movements").add({
          id: uid("move"), productId: product.id, type: fields.type, quantity: adjustment,
          reason: fields.reason.trim(), timestamp: Date.now(), unitCost: Number(fields.unitCost) || product.purchasePrice, actor: state.user.id
        });
        await transactionDone(tx);
        closeModal();
        toast("Stock movement saved.");
        await renderPage();
        await checkProductAlert(current);
      } catch (error) { toast(error.message || "Stock adjustment failed.", true); }
    });
  }
  async function archiveProduct(id) {
    const product = await get("products", id);
    if (!product) return;
    if (!confirm(`Archive “${product.name}”? Existing sales and stock history will be preserved.`)) return;
    product.archived = true;
    await save("products", product);
    toast("Product archived. Historical sales are unchanged.");
    await renderPage();
  }
  async function renderArchivedProducts() {
    const products = (await all("products")).filter(item => item.archived);
    showModal("Archived products", products.length ? `<div class="table-wrap"><table><thead><tr><th>Product</th><th>Part number</th><th>Stock</th><th>Action</th></tr></thead><tbody>${products.map(item => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.partNumber)}</td><td>${item.stockQuantity}</td><td><button class="button secondary small" data-action="unarchive-product" data-id="${item.id}">Restore</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty-state">No archived products.</div>`, true);
  }
  async function unarchiveProduct(id) {
    const product = await get("products", id);
    if (!product) return;
    product.archived = false;
    await save("products", product);
    toast("Product restored to active inventory.");
    await renderArchivedProducts();
  }
  async function renderSales(renderVersion = ++state.renderVersion) {
    const query = state.query.trim().toLowerCase();
    const products = (await all("products")).filter(row => !row.archived && (!query || [row.name, row.partNumber, row.brand].some(value => String(value || "").toLowerCase().includes(query)))).sort((a, b) => a.name.localeCompare(b.name));
    if (renderVersion !== state.renderVersion) return;
    content.innerHTML = `<div class="grid two-column">
      <div><div class="page-toolbar"><input id="sale-search" class="input search-input" placeholder="Search product name or part number" value="${escapeHtml(state.query)}"></div>
        <div class="card table-wrap">${products.length ? `<table><thead><tr><th>Product</th><th>Price</th><th>Available</th><th></th></tr></thead><tbody>${products.map(row => `<tr><td><span class="product-primary">${escapeHtml(row.name)}</span><span class="product-secondary">${escapeHtml(row.brand)} · ${escapeHtml(row.partNumber)}</span></td><td>${money(row.sellingPrice)}</td><td>${row.stockQuantity}</td><td><button class="button small" data-action="cart-add" data-id="${row.id}" ${row.stockQuantity < 1 ? "disabled" : ""}>Add</button></td></tr>`).join("")}</tbody></table>` : `<div class="empty-state"><strong>No products found</strong>Add an active product with stock to bill.</div>`}</div>
      </div>
      <div class="card"><h2>Current bill</h2><p class="muted small-text">Sale confirmation saves the transaction and stock deduction atomically.</p>
        <div id="cart-list"></div>
        <div class="field" style="margin-top:14px"><label>Customer name (optional)</label><input class="input" id="customer-name"></div>
        <div class="field" style="margin-top:10px"><label>Customer phone (optional)</label><input class="input" id="customer-phone" type="tel"></div>
        <div class="grid" style="grid-template-columns:1fr 1fr;margin-top:10px">
          <div class="field"><label>Discount (₹)</label><input class="input" id="sale-discount" type="number" min="0" step="0.01" value="0"></div>
          <div class="field"><label>Payment method</label><select id="sale-payment" class="input"><option>Cash</option><option>UPI</option><option>Card</option><option>Bank transfer</option><option>Other</option></select></div>
        </div><div id="cart-totals"></div>
        <button id="confirm-sale" class="button" style="width:100%;margin-top:12px" ${state.cart.length ? "" : "disabled"}>Confirm sale</button>
      </div></div>`;
    $("#sale-search").addEventListener("input", async event => {
      const cursor = event.target.selectionStart;
      state.query = event.target.value;
      await renderSales();
      const input = $("#sale-search");
      input.focus();
      input.setSelectionRange(cursor, cursor);
    });
    $("#sale-discount").addEventListener("input", renderCart);
    renderCart();
  }
  async function addToCart(id) {
    const product = await get("products", id);
    if (!product || product.archived || product.stockQuantity <= 0) return toast("Product is unavailable or out of stock.", true);
    const found = state.cart.find(row => row.productId === id);
    if (found) {
      if (found.quantity >= product.stockQuantity) return toast(`Only ${product.stockQuantity} available.`, true);
      found.quantity += 1;
    } else {
      state.cart.push({
        productId: product.id, quantity: 1, productName: product.name,
        partNumber: product.partNumber, brand: product.brand,
        unitPrice: product.sellingPrice, unitCost: product.purchasePrice,
        stockQuantity: product.stockQuantity
      });
    }
    renderCart();
  }
  function renderCart() {
    const list = $("#cart-list");
    if (!list) return;
    const subtotal = state.cart.length ? Domain.calculateSale(state.cart).subtotal : 0;
    const discount = Number($("#sale-discount")?.value || 0);
    list.innerHTML = state.cart.length ? state.cart.map(row => `<div class="cart-item"><div><strong>${escapeHtml(row.productName)}</strong><small class="product-secondary">${escapeHtml(row.partNumber || "")} · ${money(row.unitPrice)}</small></div><input class="input" aria-label="Quantity for ${escapeHtml(row.productName)}" type="number" min="1" max="${row.stockQuantity}" value="${row.quantity}" data-action="cart-quantity" data-id="${row.productId}"><strong>${money(row.quantity * row.unitPrice)}</strong><button class="button secondary small" data-action="cart-remove" data-id="${row.productId}" aria-label="Remove">×</button></div>`).join("") : `<div class="empty-state"><strong>Bill is empty</strong>Add products from the list.</div>`;
    $("#cart-totals").innerHTML = `<div class="cart-total"><span>Subtotal</span><span>${money(subtotal)}</span></div><div class="cart-total"><span>Discount</span><span>${money(Math.max(0, discount))}</span></div><div class="cart-total grand"><span>Total</span><span>${money(Math.max(0, subtotal - discount))}</span></div>`;
    const button = $("#confirm-sale");
    if (button) button.disabled = !state.cart.length || discount < 0 || discount > subtotal;
  }
  async function confirmSale() {
    if (!state.cart.length || state.saleSubmitting) return;
    let calculation;
    try { calculation = Domain.calculateSale(state.cart, Number($("#sale-discount").value || 0)); }
    catch (error) { return toast(error.message, true); }
    const subtotal = calculation.subtotal;
    const discount = calculation.discount;
    if (!confirm(`Confirm sale for ${money(subtotal - discount)}?`)) return;
    state.saleSubmitting = true;
    const confirmButton = $("#confirm-sale");
    if (confirmButton) confirmButton.disabled = true;
    const now = Date.now();
    const saleNumber = `MP-${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "2-digit", month: "2-digit", day: "2-digit" }).format(new Date()).replaceAll("/", "")}-${now.toString().slice(-6)}`;
    const sale = {
      id: uid("sale"), saleNumber, timestamp: now, customerName: $("#customer-name").value.trim(),
      customerPhone: $("#customer-phone").value.trim(), discount, subtotal, total: subtotal - discount,
      paymentMethod: $("#sale-payment").value, status: "completed", refundAmount: 0, actor: state.user.id
    };
    sale.subtotal = calculation.subtotal;
    sale.total = calculation.total;
    const tx = state.db.transaction(["products", "sales", "saleItems", "movements"], "readwrite");
    try {
      const products = tx.objectStore("products");
      const loaded = [];
      for (const item of state.cart) {
        const product = await requestResult(products.get(item.productId));
        if (!product || product.archived || product.stockQuantity < item.quantity) {
          throw new Error(`Insufficient available stock for ${item.productName}. Review the bill and retry.`);
        }
        loaded.push(product);
      }
      tx.objectStore("sales").add(sale);
      state.cart.forEach((item, index) => {
        const product = loaded[index];
        product.stockQuantity -= item.quantity;
        products.put(product);
        const calculatedLine = calculation.lines[index];
        tx.objectStore("saleItems").add({
          id: uid("line"), saleId: sale.id, productId: product.id, productName: product.name,
          partNumber: product.partNumber, brand: product.brand, unitPrice: calculatedLine.unitPrice,
          unitCost: product.purchasePrice, quantity: item.quantity, lineTotal: calculatedLine.lineTotal,
          refundedQuantity: 0
        });
        tx.objectStore("movements").add({
          id: uid("move"), productId: product.id, type: "sale", quantity: -item.quantity,
          reason: `Sale ${saleNumber}`, timestamp: now, unitCost: product.purchasePrice, reference: sale.id, actor: state.user.id
        });
      });
      await transactionDone(tx);
      const notifyEach = await setting("notifyEachSale", false);
      if (notifyEach) await addNotification("Sale completed", `${saleNumber} · ${money(sale.total)}`, "sales", "sale", sale.id);
      state.cart = [];
      state.saleSubmitting = false;
      state.query = "";
      await renderPage();
      toast(`Sale ${saleNumber} saved.`);
      showReceipt(sale.id);
      await checkStockAlerts();
    } catch (error) {
      state.saleSubmitting = false;
      try { tx.abort(); } catch { /* transaction may already be inactive */ }
      renderCart();
      toast(error.message || "Sale could not be saved.", true);
    }
  }
  async function showReceipt(saleId) {
    const sale = await get("sales", saleId);
    const items = (await all("saleItems")).filter(row => row.saleId === saleId);
    const shop = await setting("shopDisplayName", state.user.shopName);
    const logo = await setting("shopLogo", "");
    showModal("Sale receipt", `<div class="report-paper" id="receipt-paper"><div class="report-head">${logo ? `<img src="${escapeHtml(logo)}" alt="" class="shop-logo-large">` : ""}<h1>${escapeHtml(shop)}</h1><p class="report-meta">Motor Parts Manager · Local receipt</p></div><p><strong>Receipt:</strong> ${escapeHtml(sale.saleNumber)}<br><strong>Date:</strong> ${istDateTime(sale.timestamp)} IST<br><strong>Payment:</strong> ${escapeHtml(sale.paymentMethod)}<br><strong>Customer:</strong> ${escapeHtml(sale.customerName || "Walk-in customer")}</p>
      <table><thead><tr><th>Product</th><th>Qty</th><th>Unit price</th><th>Line total</th></tr></thead><tbody>${items.map(row => `<tr><td>${escapeHtml(row.productName)}<br>${escapeHtml(row.partNumber || "")}</td><td>${row.quantity}</td><td>${money(row.unitPrice)}</td><td>${money(row.lineTotal)}</td></tr>`).join("")}</tbody></table>
      <p style="text-align:right">Subtotal ${money(sale.subtotal)}<br>Discount ${money(sale.discount)}<br><strong>Total ${money(sale.total)}</strong></p></div>
      <div class="modal-actions"><button class="button secondary" data-action="close-modal">Close</button><button class="button" data-action="print-content" data-target="receipt-paper">Print / Save PDF</button></div>`);
  }
  async function dateRange(filter) {
    const today = todayDate();
    if (filter === "today") return [istMidnightEpoch(today), istEndEpoch(today)];
    if (filter === "all") return [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER];
    if (filter === "yesterday") {
      const yesterday = localDateString(istMidnightEpoch(today) - 1);
      return [istMidnightEpoch(yesterday), istEndEpoch(yesterday)];
    }
    if (filter === "week") {
      const [y, m, d] = today.split("-").map(Number);
      const date = new Date(Date.UTC(y, m - 1, d));
      const daysSinceMonday = (date.getUTCDay() + 6) % 7;
      const monday = new Date(date.getTime() - daysSinceMonday * 86400000);
      const start = `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, "0")}-${String(monday.getUTCDate()).padStart(2, "0")}`;
      return [istMidnightEpoch(start), istEndEpoch(today)];
    }
    if (filter === "month") return [istMidnightEpoch(`${today.slice(0, 7)}-01`), istEndEpoch(today)];
    return [istMidnightEpoch(today), istEndEpoch(today)];
  }
  async function renderHistory(renderVersion = ++state.renderVersion) {
    const sales = (await all("sales")).sort((a, b) => b.timestamp - a.timestamp);
    const items = await all("saleItems");
    const query = state.query.trim().toLowerCase();
    const [start, end] = await dateRange(state.historyFilter);
    const rows = sales.filter(sale => {
      const matchDate = state.historyFilter === "custom" ? sale.timestamp >= istMidnightEpoch($("#history-start")?.value || todayDate()) && sale.timestamp <= istEndEpoch($("#history-end")?.value || todayDate()) : sale.timestamp >= start && sale.timestamp <= end;
      const saleItems = items.filter(item => item.saleId === sale.id);
      const matchQuery = !query || sale.saleNumber.toLowerCase().includes(query) || saleItems.some(item => `${item.productName} ${item.partNumber}`.toLowerCase().includes(query));
      return matchDate && matchQuery;
    });
    if (renderVersion !== state.renderVersion) return;
    content.innerHTML = `<div class="page-toolbar"><div class="toolbar-group"><select id="history-period" class="input" aria-label="Date range"><option value="today" ${state.historyFilter === "today" ? "selected" : ""}>Today</option><option value="yesterday" ${state.historyFilter === "yesterday" ? "selected" : ""}>Yesterday</option><option value="week" ${state.historyFilter === "week" ? "selected" : ""}>This week</option><option value="month" ${state.historyFilter === "month" ? "selected" : ""}>This month</option><option value="custom" ${state.historyFilter === "custom" ? "selected" : ""}>Custom dates</option><option value="all" ${state.historyFilter === "all" ? "selected" : ""}>All dates</option></select>${state.historyFilter === "custom" ? `<input class="input" type="date" id="history-start" value="${escapeHtml($("#history-start")?.value || todayDate())}"><input class="input" type="date" id="history-end" value="${escapeHtml($("#history-end")?.value || todayDate())}">` : ""}</div><input id="history-search" class="input search-input" placeholder="Search transaction, product, part number" value="${escapeHtml(state.query)}"></div>
      <div class="card table-wrap">${rows.length ? `<table><thead><tr><th>Transaction / time (IST)</th><th>Products</th><th>Discount</th><th>Payment</th><th>Total</th><th>Status / action</th></tr></thead><tbody>${rows.map(sale => {
        const saleLines = items.filter(item => item.saleId === sale.id);
        return `<tr><td><span class="product-primary">${escapeHtml(sale.saleNumber)}</span><span class="product-secondary">${istDateTime(sale.timestamp)}</span></td><td>${saleLines.map(line => `${escapeHtml(line.productName)} × ${line.quantity}`).join("<br>")}</td><td>${money(sale.discount)}</td><td>${escapeHtml(sale.paymentMethod)}</td><td><strong>${money(sale.total)}</strong></td><td><span class="pill ${sale.status === "completed" ? "good" : "danger"}">${escapeHtml(sale.status)}</span><div class="actions" style="margin-top:6px"><button class="button secondary small" data-action="receipt" data-id="${sale.id}">Receipt</button>${sale.status === "completed" ? `<button class="button secondary small" data-action="refund" data-id="${sale.id}">Refund</button>` : ""}</div></td></tr>`;
      }).join("")}</tbody></table>` : `<div class="empty-state"><strong>No matching transactions</strong>Completed and refunded sales appear here with exact saved timestamps.</div>`}</div>`;
    $("#history-period").addEventListener("change", event => { state.historyFilter = event.target.value; renderHistory(); });
    for (const id of ["history-start", "history-end"]) $(`#${id}`)?.addEventListener("change", renderHistory);
    $("#history-search").addEventListener("input", event => { state.query = event.target.value; renderHistory(); });
  }
  async function refundSale(id) {
    const sale = await get("sales", id);
    if (!sale || sale.status !== "completed") return toast("This sale is not eligible for refund.", true);
    if (!confirm(`Refund the full sale ${sale.saleNumber} for ${money(sale.total)}? Stock will be returned and the transaction retained as refunded.`)) return;
    const tx = state.db.transaction(["sales", "saleItems", "products", "movements"], "readwrite");
    try {
      const sales = tx.objectStore("sales");
      const current = await requestResult(sales.get(id));
      if (!current || current.status !== "completed") throw new Error("Sale was already updated.");
      current.status = "refunded";
      current.refundAmount = current.total;
      current.refundedAt = Date.now();
      sales.put(current);
      const lines = await requestResult(tx.objectStore("saleItems").index("saleId").getAll(id));
      for (const line of lines) {
        const product = await requestResult(tx.objectStore("products").get(line.productId));
        if (product) {
          product.stockQuantity += line.quantity;
          tx.objectStore("products").put(product);
          tx.objectStore("movements").add({
            id: uid("move"), productId: product.id, type: "refund", quantity: line.quantity,
            reason: `Refund ${sale.saleNumber}`, timestamp: current.refundedAt, unitCost: line.unitCost, reference: sale.id, actor: state.user.id
          });
        }
      }
      await transactionDone(tx);
      toast(`Sale ${sale.saleNumber} refunded; stock restored.`);
      await renderPage();
      await checkStockAlerts();
    } catch (error) {
      try { tx.abort(); } catch { /* already closed */ }
      toast(error.message || "Refund failed.", true);
    }
  }
  async function renderReports(renderVersion = ++state.renderVersion) {
    const today = todayDate();
    if (renderVersion !== state.renderVersion) return;
    content.innerHTML = `<div class="card"><h2>Build a shop report</h2><p class="muted">Choose a report and an inclusive date range in India Standard Time. Preview first, then use your browser’s Print / Save as PDF command.</p>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:13px">
        <div class="field"><label>Report type</label><select class="input" id="report-type"><option value="sales">Sales report</option><option value="stock">Stock report</option><option value="complete">Complete shop report</option></select></div>
        <div class="field"><label>Start date (IST)</label><input class="input" type="date" id="report-start" value="${today}"></div>
        <div class="field"><label>End date (IST, inclusive)</label><input class="input" type="date" id="report-end" value="${today}"></div>
        <div class="field"><label>Shop display name</label><input class="input" id="report-shop-name" value="${escapeHtml(await setting("shopDisplayName", state.user.shopName))}"></div>
      </div><div class="toolbar-group" style="margin-top:16px"><button class="button" id="preview-report">Preview report</button></div></div>
      <div id="report-preview" style="margin-top:18px"></div>`;
    $("#preview-report").addEventListener("click", async () => {
      const start = $("#report-start").value, end = $("#report-end").value;
      if (!start || !end || start > end) return toast("Select a valid start and end date.", true);
      await setSetting("shopDisplayName", $("#report-shop-name").value.trim() || state.user.shopName);
      await buildReport($("#report-type").value, start, end);
    });
  }
  async function buildReport(type, startDate, endDate) {
    const start = istMidnightEpoch(startDate), end = istEndEpoch(endDate);
    const shopName = escapeHtml(await setting("shopDisplayName", state.user.shopName));
    const logo = await setting("shopLogo", "");
    const sales = (await all("sales")).filter(row => row.timestamp >= start && row.timestamp <= end).sort((a, b) => a.timestamp - b.timestamp);
    const lines = await all("saleItems");
    const movements = (await all("movements")).filter(row => row.timestamp >= start && row.timestamp <= end);
    const products = (await all("products")).filter(row => !row.archived);
    const completed = sales.filter(row => row.status === "completed");
    const saleLineRows = sales.flatMap(sale => lines.filter(item => item.saleId === sale.id).map(item => ({ sale, item })));
    const refunded = sales.filter(sale => sale.status === "refunded");
    const saleSummary = `<h2>Sales summary</h2><p>${completed.length} completed transactions · ${lines.filter(item => completed.some(sale => sale.id === item.saleId)).reduce((sum, item) => sum + item.quantity, 0)} items · Revenue ${money(completed.reduce((sum, row) => sum + row.total, 0))} · Discounts ${money(completed.reduce((sum, row) => sum + row.discount, 0))} · Estimated gross profit ${money(Domain.grossProfit(completed, lines))} · Refunded ${refunded.length} transactions / ${money(refunded.reduce((sum, sale) => sum + (sale.refundAmount || sale.total), 0))}</p>`;
    const salesTable = saleLineRows.length ? `<table><thead><tr><th>Date/time (IST)</th><th>Transaction</th><th>Status / refund</th><th>Customer</th><th>Product / part number</th><th>Qty</th><th>Unit price</th><th>Line total</th><th>Discount</th><th>Sale total</th><th>Payment</th></tr></thead><tbody>${saleLineRows.map(({ sale, item }) => `<tr><td>${istDateTime(sale.timestamp)}</td><td>${escapeHtml(sale.saleNumber)}</td><td>${escapeHtml(sale.status)}${sale.status === "refunded" ? `<br>${money(sale.refundAmount || sale.total)}` : ""}</td><td>${escapeHtml(sale.customerName || "Walk-in")}</td><td>${escapeHtml(item.productName)}<br>${escapeHtml(item.partNumber)}</td><td>${item.quantity}</td><td>${money(item.unitPrice)}</td><td>${money(item.lineTotal)}</td><td>${money(sale.discount)}</td><td>${money(sale.total)}</td><td>${escapeHtml(sale.paymentMethod)}</td></tr>`).join("")}</tbody></table>` : `<p>No sales in the selected period.</p>`;
    const allMovements = await all("movements");
    const stockTable = `<table><thead><tr><th>Product / part number</th><th>Brand / vehicle</th><th>Opening</th><th>Received</th><th>Sold</th><th>Returns / adjustments</th><th>Closing</th><th>Current</th><th>Purchase / sale</th></tr></thead><tbody>${products.map(product => {
      const pm = allMovements.filter(row => row.productId === product.id);
      const projection = Domain.projectStock(product.stockQuantity, pm, start, end);
      return `<tr><td>${escapeHtml(product.name)}<br>${escapeHtml(product.partNumber)}</td><td>${escapeHtml(product.brand)}<br>${escapeHtml(product.compatibleModels)}</td><td>${projection.opening}</td><td>${projection.received}</td><td>${projection.sold}</td><td>${projection.returnsAndAdjustments}</td><td>${projection.closing}</td><td>${product.stockQuantity}</td><td>${money(product.purchasePrice)} / ${money(product.sellingPrice)}</td></tr>`;
    }).join("")}</tbody></table>`;
    const movesTable = movements.length ? `<table><thead><tr><th>Timestamp</th><th>Product</th><th>Movement</th><th>Qty</th><th>Reason</th></tr></thead><tbody>${movements.map(move => `<tr><td>${istDateTime(move.timestamp)}</td><td>${escapeHtml(products.find(row => row.id === move.productId)?.name || "Archived product")}</td><td>${escapeHtml(move.type)}</td><td>${move.quantity > 0 ? "+" : ""}${move.quantity}</td><td>${escapeHtml(move.reason)}</td></tr>`).join("")}</tbody></table>` : "<p>No stock movements in this period.</p>";
    const lowItems = products.filter(row => row.stockQuantity <= row.minStock);
    const showSales = type !== "stock";
    const showStock = type !== "sales";
    $("#report-preview").innerHTML = `<article id="print-area" class="card report-paper">
      <div class="report-head">${logo ? `<img src="${escapeHtml(logo)}" alt="" class="shop-logo-large">` : ""}<h1>${shopName}</h1><h2>${type === "sales" ? "Sales report" : type === "stock" ? "Stock report" : "Complete shop report"}</h2><p class="report-meta">Period: ${escapeHtml(startDate)} through ${escapeHtml(endDate)} (IST, inclusive) · Generated ${istDateTime(Date.now())} IST</p></div>
      ${showSales ? `${saleSummary}<div class="table-wrap">${salesTable}</div>` : ""}
      ${showStock ? `<h2 style="margin-top:28px">Stock position</h2><div class="table-wrap">${stockTable}</div><h2 style="margin-top:28px">Stock movement history</h2><div class="table-wrap">${movesTable}</div><h2 style="margin-top:28px">Low and out-of-stock products</h2><p>${lowItems.length ? lowItems.map(row => `${escapeHtml(row.name)} (${row.stockQuantity} / min ${row.minStock})`).join(" · ") : "None"}</p>` : ""}
      <p class="report-meta" style="margin-top:24px">Historical sales use saved sale item snapshots. Stock opening/closing values are reconstructed from recorded movements; current stock is shown separately.</p>
      <div class="toolbar-group no-print"><button class="button" data-action="print-content" data-target="print-area">Print / Save PDF</button></div>
    </article>`;
  }
  async function addNotification(title, message, category, targetType = "none", targetId = "") {
    if (!await setting(`notify-${category}`, true)) return;
    const notification = {
      id: uid("notification"), title, message, category, createdAt: Date.now(),
      read: false, targetType, targetId: String(targetId), actor: state.user?.id
    };
    await save("notifications", notification);
    updateUnreadBadge();
    if ("Notification" in window && Notification.permission === "granted") {
      try { new Notification(title, { body: message, tag: `mmp-${category}-${targetId || title}` }); }
      catch (error) { console.warn("Browser notification was not displayed.", error); }
    }
  }
  async function checkProductAlert(product) {
    const notifications = (await all("notifications")).filter(row => row.targetType === "product" && row.targetId === String(product.id) && row.category === "stock");
    const prior = notifications.sort((a, b) => b.createdAt - a.createdAt)[0];
    const status = Domain.stockStatus(product.stockQuantity, product.minStock);
    if (product.archived || status === "good") {
      if (prior && prior.condition !== "healthy") {
        prior.condition = "healthy";
        await save("notifications", prior);
      }
      return;
    }
    const currentCondition = status;
    const marker = `${currentCondition}:${product.stockQuantity}`;
    if (prior?.condition?.startsWith(`${currentCondition}:`)) return;
    const title = currentCondition === "out" ? "Product out of stock" : "Low stock alert";
    await addNotification(title, `${product.name}: ${product.stockQuantity} available (minimum ${product.minStock}).`, "stock", "product", product.id);
    const latest = (await all("notifications")).find(row => row.title === title && row.targetId === String(product.id));
    if (latest) { latest.condition = marker; await save("notifications", latest); }
  }
  async function checkStockAlerts() {
    const products = (await all("products")).filter(row => !row.archived && row.stockQuantity <= row.minStock);
    for (const product of products) await checkProductAlert(product);
  }
  async function maybeDailySummary() {
    const enabled = await setting("dailySummaryEnabled", false);
    if (!enabled) return;
    const time = await setting("dailySummaryTime", "20:00");
    const now = new Date(Date.now() + 330 * 60000);
    const hhmm = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;
    const day = todayDate();
    if (hhmm < time || await setting("dailySummaryLastSent", "") === day) return;
    const summary = await todaySummary();
    await addNotification("Daily sales summary", `${day}: ${money(summary.revenue)} · ${summary.transactions} transactions · ${summary.items} items`, "sales", "report", day);
    await setSetting("dailySummaryLastSent", day);
  }
  async function updateUnreadBadge() {
    const notifications = await all("notifications");
    const count = notifications.filter(row => !row.read && (!state.user || row.actor === state.user.id)).length;
    $("#alert-count").textContent = count > 99 ? "99+" : String(count);
    $("#alert-count").hidden = count === 0;
  }
  async function renderNotifications(renderVersion = ++state.renderVersion) {
    const notifications = (await all("notifications")).filter(row => row.actor === state.user.id).sort((a, b) => b.createdAt - a.createdAt);
    if (renderVersion !== state.renderVersion) return;
    content.innerHTML = `<div class="page-toolbar"><p class="muted">Stock alerts and saved sale summaries for this browser.</p><button class="button secondary" data-action="mark-all-read">Mark all read</button></div>
      <div class="card stack">${notifications.length ? notifications.map(row => `<div class="setting-row"><span class="stat-icon">${row.category === "stock" ? "⚠" : "₹"}</span><div class="setting-copy"><strong>${escapeHtml(row.title)} ${row.read ? "" : '<span class="pill good">New</span>'}</strong><small>${escapeHtml(row.message)} · ${istDateTime(row.createdAt)} IST</small></div>${row.targetType === "product" ? `<button class="button secondary small" data-action="open-product" data-id="${escapeHtml(row.targetId)}">Product</button>` : ""}<button class="button secondary small" data-action="read-notification" data-id="${row.id}">${row.read ? "Read" : "Mark read"}</button></div>`).join("") : `<div class="empty-state"><strong>No notifications</strong>New low-stock and sale notifications will appear here.</div>`}</div>`;
  }
  async function markNotificationRead(id) {
    const item = await get("notifications", id);
    if (!item || item.actor !== state.user.id) return;
    item.read = true;
    await save("notifications", item);
    await renderPage();
    updateUnreadBadge();
  }
  async function renderSettings(renderVersion = ++state.renderVersion) {
    const appearance = await setting("appearance", { mode: "system", accent: "#0f766e", density: "comfortable", fontSize: "normal" });
    const notifyStock = await setting("notify-stock", true);
    const notifySales = await setting("notify-sales", true);
    const notifyEachSale = await setting("notifyEachSale", false);
    const dailyEnabled = await setting("dailySummaryEnabled", false);
    const dailyTime = await setting("dailySummaryTime", "20:00");
    const shopDisplayName = await setting("shopDisplayName", state.user.shopName);
    const shopLogo = await setting("shopLogo", "");
    const appLockCredential = await setting("appLockCredential", null);
    const appLockTimeout = await setting("appLockTimeout", 5);
    if (renderVersion !== state.renderVersion) return;
    content.innerHTML = `<div class="grid two-column"><div class="card"><h2>Account</h2><div class="settings-list">
      <div class="setting-row"><div class="setting-copy"><strong>${escapeHtml(state.user.name)}</strong><small>Shopkeeper</small></div><button class="button secondary small" data-action="edit-profile">Edit profile</button></div>
      <div class="setting-row"><div class="setting-copy"><strong>${escapeHtml(state.user.shopName)}</strong><small>Shop name</small></div></div>
      <div class="setting-row"><div class="setting-copy"><strong>${escapeHtml(state.user.email)}</strong><small>Registered email</small></div></div>
      <div class="setting-row"><div class="setting-copy"><strong>${escapeHtml(state.user.phone)}</strong><small>Phone</small></div></div>
      <div class="setting-row"><div class="setting-copy"><strong>Local account</strong><small>Stored on this browser only; no server login or email recovery.</small></div><div class="actions"><button class="button secondary small" data-action="change-password">Change password</button><button class="button danger small" data-action="logout">Log out</button></div></div>
    </div></div>
    <div class="card"><h2>Appearance</h2><div class="settings-list">
      ${settingControl("Theme", "mode", `<select class="input" id="appearance-mode"><option value="system" ${appearance.mode === "system" ? "selected" : ""}>Follow system</option><option value="light" ${appearance.mode === "light" ? "selected" : ""}>Light</option><option value="dark" ${appearance.mode === "dark" ? "selected" : ""}>Dark</option></select>`, "Applies throughout the app")}
      ${settingControl("Accent colour", "accent", `<select class="input" id="appearance-accent">${[["#0f766e","Teal"],["#2563eb","Blue"],["#7c3aed","Violet"],["#b45309","Amber"],["#be123c","Rose"]].map(([value,label])=>`<option value="${value}" ${appearance.accent === value ? "selected" : ""}>${label}</option>`).join("")}</select>`, "Accessible accent palette")}
      ${settingControl("List density", "density", `<select class="input" id="appearance-density"><option value="comfortable" ${appearance.density === "comfortable" ? "selected" : ""}>Comfortable</option><option value="compact" ${appearance.density === "compact" ? "selected" : ""}>Compact</option></select>`, "Inventory and history rows")}
      ${settingControl("Text size", "font", `<select class="input" id="appearance-font"><option value="normal" ${appearance.fontSize === "normal" ? "selected" : ""}>Normal</option><option value="small" ${appearance.fontSize === "small" ? "selected" : ""}>Small</option><option value="large" ${appearance.fontSize === "large" ? "selected" : ""}>Large</option></select>`, "Changes the app text size")}
      ${settingControl("Shop display name", "shop", `<input class="input" id="shop-display-name" value="${escapeHtml(shopDisplayName)}">`, "Shown on reports and receipts")}
      <div class="setting-row"><div class="setting-copy"><strong>Shop logo</strong><small>Optional image used in the dashboard, receipts and reports.</small></div><div class="setting-control stack"><input class="input" id="shop-logo" type="file" accept="image/png,image/jpeg,image/webp"><small class="muted">${shopLogo ? "Logo saved locally." : "PNG, JPEG or WebP up to 500 KB"}</small>${shopLogo ? `<button class="button secondary small" data-action="remove-logo">Remove logo</button>` : ""}</div></div>
    </div></div>
    <div class="card"><h2>Notifications</h2><div class="settings-list">
      ${settingControl("Stock alerts", "notif-stock", `<input type="checkbox" id="notify-stock" ${notifyStock ? "checked" : ""}>`, "Low and out-of-stock conditions")}
      ${settingControl("Sales summaries", "notif-sales", `<input type="checkbox" id="notify-sales" ${notifySales ? "checked" : ""}>`, "In-app daily summary notification")}
      ${settingControl("After every completed sale", "notif-sale-each", `<input type="checkbox" id="notify-each-sale" ${notifyEachSale ? "checked" : ""}>`, "Create an in-app sale notification")}
      ${settingControl("Daily summary", "daily-enabled", `<input type="checkbox" id="daily-enabled" ${dailyEnabled ? "checked" : ""}>`, "Evaluated when the app is open; background delivery is not guaranteed")}
      ${settingControl("Summary time", "daily-time", `<input class="input" type="time" id="daily-time" value="${escapeHtml(dailyTime)}">`, "Asia/Kolkata time")}
      <div class="setting-row"><div class="setting-copy"><strong>Browser notifications</strong><small>${"Notification" in window ? `Permission: ${Notification.permission}` : "Not supported by this browser"}</small></div><button class="button secondary small" data-action="request-notifications">Request permission</button></div>
    </div></div>
    <div class="card"><h2>Security & privacy</h2><div class="settings-list">
      <div class="notice">Business records are stored in this browser's IndexedDB. Passwords use PBKDF2 hashes, but the database is not encrypted. Anyone with browser-profile or developer-tools access may access local records. The optional PIN locks only the interface; it does not encrypt data. There is no cloud synchronization or remote password recovery.</div>
      ${settingControl("App lock PIN", "app-lock", `<div class="stack"><span class="pill ${appLockCredential ? "good" : ""}">${appLockCredential ? "Enabled" : "Disabled"}</span><button class="button secondary small" data-action="configure-app-lock">${appLockCredential ? "Change / disable PIN" : "Set app PIN"}</button></div>`, "A browser UI lock; it does not encrypt IndexedDB or replace device security")}
      ${settingControl("Auto-lock timeout", "lock-timeout", `<select class="input" id="lock-timeout" ${appLockCredential ? "" : "disabled"}>${[1,5,10,15,30].map(value => `<option value="${value}" ${Number(appLockTimeout) === value ? "selected" : ""}>${value} minute${value === 1 ? "" : "s"}</option>`).join("")}</select>`, "Locks after inactivity while this app is open")}
      <div class="setting-row"><div class="setting-copy"><strong>Export backup</strong><small>Download all local shop records as a JSON file.</small></div><button class="button secondary small" data-action="export-backup">Export data</button></div>
      <div class="setting-row"><div class="setting-copy"><strong>Restore backup</strong><small>Replaces current browser data after explicit confirmation.</small></div><button class="button secondary small" data-action="import-backup">Choose file</button></div>
      <div class="setting-row"><div class="setting-copy"><strong>Privacy notice and local data</strong><small>No account data is transmitted to a server by this app.</small></div><button class="button secondary small" data-action="privacy">Read details</button></div>
      <div class="setting-row"><div class="setting-copy"><strong>Clear all local shop data</strong><small>This deletes products, transactions, accounts and settings from this browser.</small></div><button class="button danger small" data-action="clear-data">Clear data</button></div>
    </div></div>
    <div class="card"><h2>Customer support & about</h2><div class="settings-list">
      <div class="notice">The support email is still a placeholder and must be configured before release: ${escapeHtml(SUPPORT_EMAIL)}</div>
      <div class="setting-row"><div class="setting-copy"><strong>Contact support</strong><small>Opens the configured email app; no email is sent automatically.</small></div><button class="button secondary small" data-action="support">Email support</button></div>
      <div class="setting-row"><div class="setting-copy"><strong>Frequently asked questions</strong><small>Offline storage, backups, reports and notification behavior.</small></div><button class="button secondary small" data-action="faq">View FAQ</button></div>
      <div class="setting-row"><div class="setting-copy"><strong>App version</strong><small>Motor Parts Manager · Web 1.0.0 · Offline-first PWA shell</small></div></div>
    </div></div></div>`;
    bindSettings();
  }
  function settingControl(label, id, control, help) {
    return `<div class="setting-row"><div class="setting-copy"><strong>${label}</strong><small>${help}</small></div><div class="setting-control">${control}</div></div>`;
  }
  async function applyAppearance() {
    const appearance = await setting("appearance", { mode: "system", accent: "#0f766e", density: "comfortable", fontSize: "normal" });
    const dark = appearance.mode === "dark" || (appearance.mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.style.setProperty("--accent", appearance.accent || "#0f766e");
    document.documentElement.style.setProperty("--accent-soft", `${appearance.accent || "#0f766e"}22`);
    document.documentElement.classList.toggle("density-compact", appearance.density === "compact");
    document.documentElement.classList.toggle("font-small", appearance.fontSize === "small");
    document.documentElement.classList.toggle("font-large", appearance.fontSize === "large");
  }
  async function bindSettings() {
    for (const [id, key, transform] of [
      ["appearance-mode", "mode", value => value], ["appearance-accent", "accent", value => value],
      ["appearance-density", "density", value => value], ["appearance-font", "fontSize", value => value]
    ]) {
      $(`#${id}`).addEventListener("change", async event => {
        const appearance = await setting("appearance", {});
        appearance[key] = transform(event.target.value);
        await setSetting("appearance", appearance);
        await applyAppearance();
      });
    }
    $("#shop-display-name").addEventListener("change", event => setSetting("shopDisplayName", event.target.value.trim() || state.user.shopName));
    $("#shop-logo").addEventListener("change", async event => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 500 * 1024) {
        toast("Choose a PNG, JPEG or WebP image no larger than 500 KB.", true);
        event.target.value = "";
        return;
      }
      try {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error || new Error("Could not read the selected image."));
          reader.readAsDataURL(file);
        });
        await setSetting("shopLogo", dataUrl);
        await showApp();
        toast("Shop logo saved on this device.");
      } catch (error) { toast(error.message || "Could not save the logo.", true); }
    });
    for (const [id, key] of [["notify-stock", "notify-stock"], ["notify-sales", "notify-sales"], ["notify-each-sale", "notifyEachSale"], ["daily-enabled", "dailySummaryEnabled"]]) {
      $(`#${id}`).addEventListener("change", event => setSetting(key, event.target.checked));
    }
    $("#daily-time").addEventListener("change", event => setSetting("dailySummaryTime", event.target.value));
    $("#lock-timeout").addEventListener("change", async event => {
      await setSetting("appLockTimeout", Number(event.target.value));
      await startLockTimer();
    });
  }
  function showModal(title, inner, narrow = false) {
    dialogRoot.innerHTML = `<div class="modal-backdrop" role="presentation"><section class="modal${narrow ? " narrow" : ""}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}"><div class="modal-head"><h2>${escapeHtml(title)}</h2><button class="button secondary small" data-action="close-modal" aria-label="Close dialog">Close</button></div>${inner}</section></div>`;
    $(".modal-backdrop", dialogRoot).addEventListener("click", event => {
      if (event.target.classList.contains("modal-backdrop")) closeModal();
    });
  }
  function closeModal() { dialogRoot.innerHTML = ""; }
  async function delegatedClick(event) {
    const button = event.target.closest("[data-page], [data-action]");
    if (!button) return;
    if (button.dataset.page) {
      state.page = button.dataset.page;
      state.query = "";
      renderNavigation();
      await renderPage();
      return;
    }
    const id = button.dataset.id;
    switch (button.dataset.action) {
      case "add-product": return productForm();
      case "edit-product": return productForm(await get("products", id));
      case "move-stock": return stockForm(id);
      case "archive-product": return archiveProduct(id);
      case "archived-products": return renderArchivedProducts();
      case "unarchive-product": return unarchiveProduct(id);
      case "cart-add": return addToCart(id);
      case "cart-remove": state.cart = state.cart.filter(row => row.productId !== id); return renderCart();
      case "confirm-sale": return confirmSale();
      case "refund": return refundSale(id);
      case "receipt": return showReceipt(id);
      case "read-notification": return markNotificationRead(id);
      case "mark-all-read": {
        const notifications = (await all("notifications")).filter(row => row.actor === state.user.id);
        for (const item of notifications) { item.read = true; await save("notifications", item); }
        await renderPage(); return updateUnreadBadge();
      }
      case "open-product":
        closeModal();
        const targetProduct = await get("products", id);
        state.page = "inventory"; state.query = targetProduct?.name || "";
        renderNavigation(); await renderPage(); return;
      case "close-modal": return closeModal();
      case "print-content": return printElement(button.dataset.target);
      case "request-notifications": return requestNotificationPermission();
      case "export-backup": return exportBackup();
      case "import-backup": return importBackup();
      case "clear-data": return clearLocalData();
      case "privacy": return showPrivacy();
      case "faq": return showFaq();
      case "support": return contactSupport();
      case "recovery": return showRecovery();
      case "password-sign-in":
        clearSession();
        renderAuth("login");
        return;
      case "toggle-password": {
        const input = $("#login-password");
        if (!input) return;
        input.type = input.type === "password" ? "text" : "password";
        action.textContent = input.type === "password" ? "Show" : "Hide";
        return;
      }
      case "change-password": return showChangePassword();
      case "edit-profile": return editProfile();
      case "configure-app-lock": return configureAppLock();
      case "disable-app-lock": return disableAppLock();
      case "remove-logo":
        await remove("settings", "shopLogo");
        await showApp();
        toast("Shop logo removed.");
        return;
      case "logout": return logout();
      case "login": return renderAuth("login");
      case "register": return renderAuth("register");
    }
  }
  function printElement(id) {
    const target = document.getElementById(id);
    if (!target) return toast("Nothing is ready to print.", true);
    if (id !== "print-area") {
      target.dataset.previousId = id;
      target.id = "print-area";
      window.addEventListener("afterprint", () => {
        target.id = target.dataset.previousId;
        delete target.dataset.previousId;
      }, { once: true });
    }
    window.print();
  }
  async function requestNotificationPermission() {
    if (!("Notification" in window)) return toast("This browser does not support web notifications.", true);
    const result = await Notification.requestPermission();
    toast(result === "granted" ? "Browser notifications are enabled." : `Notification permission: ${result}.`);
    await renderPage();
  }
  async function exportBackup() {
    const data = { format: "motor-parts-manager-backup", version: 1, exportedAt: Date.now(), stores: {} };
    for (const name of STORE_NAMES) data.stores[name] = await all(name);
    downloadBlob(JSON.stringify(data, null, 2), `motor-parts-backup-${todayDate()}.json`, "application/json");
    toast("Backup downloaded. Store it somewhere safe.");
  }
  function importBackup() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const backup = JSON.parse(await file.text());
        if (backup.format !== "motor-parts-manager-backup" || !backup.stores || !STORE_NAMES.every(name => Array.isArray(backup.stores[name]))) throw new Error("This file is not a valid Motor Parts Manager backup.");
        if (!confirm("Restore replaces ALL current local app data with this backup. Export a backup of current data first if needed. Continue?")) return;
        const tx = state.db.transaction(STORE_NAMES, "readwrite");
        for (const name of STORE_NAMES) {
          const store = tx.objectStore(name);
          store.clear();
          for (const item of backup.stores[name]) store.put(item);
        }
        await transactionDone(tx);
        toast("Backup restored. Sign in again if needed.");
        clearSession();
        location.reload();
      } catch (error) { toast(error.message || "Restore failed.", true); }
    });
    input.click();
  }
  async function clearLocalData() {
    if (!confirm("Permanently delete all local shop records, including accounts and sales? This cannot be undone. Export a backup first if you need one.")) return;
    if (!confirm("Final confirmation: delete all Motor Parts Manager data from this browser?")) return;
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = resolve; request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Close other app tabs before clearing data."));
    });
    clearSession();
    location.reload();
  }
  function downloadBlob(contentText, filename, type) {
    const url = URL.createObjectURL(new Blob([contentText], { type }));
    const link = document.createElement("a");
    link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function showPrivacy() {
    showModal("Privacy and data storage", `<div class="stack"><p>This application operates on this device using browser IndexedDB. It does not send business records to a server, and it does not offer cloud synchronization, remote password recovery, or server-side identity verification.</p><p>Passwords are verified using PBKDF2 with a unique random salt in Web Crypto. The database itself is not encrypted by this app. The optional PIN locks only the app interface; it does not encrypt records, and developer-tools access can inspect local data.</p><p>Backups contain shop records and account password hashes; protect downloaded backup files. Clearing browser data, uninstalling or using a different browser/profile can remove or hide the local database. Browser storage may be cleared by the operating system under storage pressure.</p><p>Notification and offline/PWA features require a secure origin (HTTPS or localhost) and depend on browser support. Scheduled notifications cannot be guaranteed while the browser is closed.</p><p>Support address is a release placeholder: <strong>${escapeHtml(SUPPORT_EMAIL)}</strong>.</p></div><div class="modal-actions"><button class="button" data-action="close-modal">Close</button></div>`);
  }
  function showFaq() {
    showModal("Frequently asked questions", `<div class="stack"><details open><summary>Does it work offline?</summary><p>After the page is first served through HTTPS or localhost and cached by its service worker, the app shell and saved shop data are available offline in supported browsers.</p></details><details><summary>Where is my shop data stored?</summary><p>In this browser profile on this device. The app does not sync it to a server.</p></details><details><summary>Can I recover a forgotten password?</summary><p>No remote recovery exists for an offline local account. Export a backup regularly. Do not clear site data if you cannot sign in.</p></details><details><summary>How do I save a PDF report?</summary><p>Preview a report, choose Print / Save PDF, then select Save as PDF in your browser's print dialog.</p></details><details><summary>Are daily alerts guaranteed?</summary><p>No. The app checks the configured summary when opened; browser/OS background delivery is restricted and may not run while closed.</p></details><details><summary>Can I do partial refunds?</summary><p>This version records full-sale refunds only. A refund restores the entire bill's stock and marks the sale as refunded.</p></details></div><div class="modal-actions"><button class="button" data-action="close-modal">Close</button></div>`);
  }
  async function contactSupport() {
    if (SUPPORT_EMAIL.includes("YOUR_SUPPORT_EMAIL")) {
      showModal("Support email not configured", `<p>Set a real support address in <code>web/app.js</code> before release. No email has been sent.</p><p>Current placeholder: <strong>${escapeHtml(SUPPORT_EMAIL)}</strong></p><div class="modal-actions"><button class="button" data-action="close-modal">Close</button></div>`, true);
      return;
    }
    const subject = encodeURIComponent("Motor Parts Manager support request");
    const body = encodeURIComponent(`App version: Web 1.0.0\nBrowser: ${navigator.userAgent}\n`);
    location.href = `mailto:${encodeURIComponent(SUPPORT_EMAIL)}?subject=${subject}&body=${body}`;
  }
  function showRecovery() {
    showModal("Password recovery", `<div class="notice danger-notice">This is a local-only account. No email verification or remote password recovery is available. For privacy, this app cannot reset a forgotten password without the existing password.</div><p>Do not clear browser storage if you still need the records. If you are signed in elsewhere, export a backup before migrating. Otherwise your saved data remains in the browser but cannot be accessed through a reset flow.</p><div class="modal-actions"><button class="button" data-action="close-modal">Close</button></div>`, true);
  }
  async function showChangePassword() {
    showModal("Change password", `<form id="password-form" class="stack"><div class="field"><label>Current password</label><input class="input" name="current" type="password" required></div><div class="field"><label>New password (8+ characters)</label><input class="input" name="next" type="password" minlength="8" required></div><div class="field"><label>Confirm new password</label><input class="input" name="confirm" type="password" required></div><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Cancel</button><button class="button" type="submit">Change password</button></div></form>`, true);
    $("#password-form").addEventListener("submit", async event => {
      event.preventDefault();
      const fields = Object.fromEntries(new FormData(event.currentTarget));
      const current = await hashPassword(fields.current, state.user.salt);
      if (current.hash !== state.user.passwordHash) return toast("Current password is incorrect.", true);
      if (fields.next.length < 8 || fields.next !== fields.confirm) return toast("New password must be 8+ characters and match confirmation.", true);
      const credential = await hashPassword(fields.next);
      state.user.salt = credential.salt; state.user.passwordHash = credential.hash;
      await save("users", state.user);
      closeModal(); toast("Password updated.");
    });
  }
  function editProfile() {
    showModal("Edit profile", `<form id="profile-form" class="stack"><div class="field"><label>Shopkeeper name</label><input class="input" name="name" required value="${escapeHtml(state.user.name)}"></div><div class="field"><label>Shop name</label><input class="input" name="shopName" required value="${escapeHtml(state.user.shopName)}"></div><div class="field"><label>Registered email</label><input class="input" name="email" type="email" required value="${escapeHtml(state.user.email)}"></div><div class="field"><label>Phone</label><input class="input" name="phone" required value="${escapeHtml(state.user.phone)}"></div><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Cancel</button><button class="button" type="submit">Save profile</button></div></form>`, true);
    $("#profile-form").addEventListener("submit", async event => {
      event.preventDefault();
      const fields = Object.fromEntries(new FormData(event.currentTarget));
      const email = fields.email.trim().toLowerCase();
      const users = await all("users");
      if (users.some(row => row.id !== state.user.id && row.email === email)) return toast("That email is already used by another local account.", true);
      Object.assign(state.user, { name: fields.name.trim(), shopName: fields.shopName.trim(), email, phone: fields.phone.trim() });
      await save("users", state.user);
      closeModal(); await showApp(); toast("Profile updated.");
    });
  }
  async function configureAppLock() {
    showModal("Configure app PIN", `<form id="app-lock-setup" class="stack">
      <p class="muted small-text">The PIN adds an inactivity lock to the app interface. It does not encrypt the local database.</p>
      <div class="field"><label>Account password</label><input class="input" name="password" type="password" required autocomplete="current-password"></div>
      <div class="field"><label>New 6-digit PIN</label><input class="input" name="pin" type="password" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="new-password"></div>
      <div class="field"><label>Confirm PIN</label><input class="input" name="confirmPin" type="password" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="new-password"></div>
      <div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Cancel</button><button type="button" class="button secondary" data-action="disable-app-lock">Disable PIN</button><button class="button" type="submit">Save PIN</button></div>
    </form>`, true);
    $("#app-lock-setup").addEventListener("submit", async event => {
      event.preventDefault();
      const fields = Object.fromEntries(new FormData(event.currentTarget));
      const verified = await hashPassword(fields.password, state.user.salt);
      if (verified.hash !== state.user.passwordHash) return toast("Account password is incorrect.", true);
      if (!/^\d{6}$/.test(fields.pin) || fields.pin !== fields.confirmPin) return toast("Enter matching 6-digit PINs.", true);
      const pinCredential = await hashPassword(fields.pin);
      await setSetting("appLockCredential", pinCredential);
      closeModal();
      await startLockTimer();
      await renderPage();
      toast("App lock PIN enabled.");
    });
  }
  async function disableAppLock() {
    const form = $("#app-lock-setup");
    if (!form) return;
    const fields = Object.fromEntries(new FormData(form));
    if (!fields.password) return toast("Enter your account password to disable the PIN.", true);
    const verified = await hashPassword(fields.password, state.user.salt);
    if (verified.hash !== state.user.passwordHash) return toast("Account password is incorrect.", true);
    await remove("settings", "appLockCredential");
    clearTimeout(idleTimer);
    state.lockTimeoutMs = 0;
    closeModal();
    await renderPage();
    toast("App lock disabled.");
  }
  function logout() {
    if (!confirm("Log out of Motor Parts Manager? Your saved local data will remain on this browser.")) return;
    clearSession();
    state.cart = [];
    state.page = "dashboard";
    renderAuth("login");
  }
  document.addEventListener("click", async event => {
    const action = event.target.closest("[data-action]");
    const navButton = event.target.closest("#navigation [data-page]");
    if (navButton) {
      state.page = navButton.dataset.page;
      state.query = "";
      renderNavigation();
      await renderPage();
      return;
    }
    if (action && action.closest("#auth")) {
      switch (action.dataset.action) {
        case "login": return renderAuth("login");
        case "register": return renderAuth("register");
        case "support": return contactSupport();
        case "privacy": return showPrivacy();
        case "recovery": return showRecovery();
      }
    }
    if (event.target.closest("#logout-button")) return logout();
    if (event.target.closest("#alerts-button")) {
      state.page = "notifications"; renderNavigation(); await renderPage();
    }
    if (event.target.closest("#confirm-sale")) await confirmSale();
    if (action && !action.closest("#auth") && action.closest("#content")) {
      await delegatedClick(event);
    }
    if (action && action.closest("#dialog-root")) {
      if (action.dataset.action === "close-modal") closeModal();
      if (action.dataset.action === "print-content") printElement(action.dataset.target);
      if (action.dataset.action === "unarchive-product") await unarchiveProduct(action.dataset.id);
      if (action.dataset.action === "disable-app-lock") await disableAppLock();
    }
  });
  document.addEventListener("change", event => {
    const quantityInput = event.target.closest('[data-action="cart-quantity"]');
    if (!quantityInput) return;
    const row = state.cart.find(item => item.productId === quantityInput.dataset.id);
    const quantity = Number(quantityInput.value);
    if (row && Number.isInteger(quantity) && quantity >= 1 && quantity <= row.stockQuantity) row.quantity = quantity;
    else if (row) quantityInput.value = row.quantity;
    renderCart();
  });
  document.addEventListener("submit", async event => {
    if (event.target.id === "app-lock-form") {
      event.preventDefault();
      const credential = await setting("appLockCredential", null);
      const { pin } = Object.fromEntries(new FormData(event.target));
      if (!credential) return renderLock("App lock is not configured. Use account password sign-in.");
      const candidate = await hashPassword(pin, credential.salt);
      if (candidate.hash !== credential.hash) return renderLock("Incorrect PIN. Try again or use your account password.");
      sessionStorage.setItem("motor-parts-last-active", String(Date.now()));
      authRoot.hidden = true;
      await applyAppearance();
      await showApp();
      await startLockTimer();
      return;
    }
    if (event.target.id === "login-form") {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.target));
      try {
        const user = await authenticate(data.email, data.password);
        if (!user) return renderAuth("login", "Incorrect email or password.");
        await completeLogin(user, Boolean(data.remember));
      } catch (error) { renderAuth("login", error.message); }
    }
    if (event.target.id === "register-form") {
      event.preventDefault();
      try {
        await createUser(event.target);
        await completeLogin(state.user, true);
        toast("Account created. Your shop is ready.");
      } catch (error) { renderAuth("register", error.message); }
    }
  });
  window.addEventListener("online", () => { $("#connection-state").textContent = "● Data saved on this device"; });
  window.addEventListener("offline", () => { $("#connection-state").textContent = "● Offline · local data active"; });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
    if (state.user) applyAppearance();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && state.user) {
      if (state.lockTimeoutMs && Date.now() - Number(sessionStorage.getItem("motor-parts-last-active") || 0) >= state.lockTimeoutMs) renderLock();
      else {
        recordActivity();
        maybeDailySummary();
      }
    }
  });
  document.addEventListener("pointerdown", recordActivity);
  document.addEventListener("keydown", recordActivity);
  async function init() {
    try {
      if (!("indexedDB" in window) || !crypto.subtle) throw new Error("This browser does not support the secure storage features required by the app.");
      state.db = await openDatabase();
      await restoreSession();
      await applyAppearance();
      if (state.user) {
        const lockCredential = await setting("appLockCredential", null);
        const lockTimeout = Number(await setting("appLockTimeout", 5)) * 60 * 1000;
        const lastActive = Number(sessionStorage.getItem("motor-parts-last-active") || 0);
        if (lockCredential && (!lastActive || Date.now() - lastActive >= lockTimeout)) renderLock();
        else {
          if (lockCredential) sessionStorage.setItem("motor-parts-last-active", String(Date.now()));
          await showApp();
          await startLockTimer();
          await checkStockAlerts();
          await maybeDailySummary();
        }
      } else renderAuth("login");
      if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
        navigator.serviceWorker.register("./service-worker.js").catch(error => console.warn("Offline cache could not be enabled.", error));
      }
    } catch (error) {
      authRoot.hidden = false;
      authRoot.innerHTML = `<div class="auth-card"><h1>Cannot start the app</h1><p>${escapeHtml(error.message)}</p><p class="muted">Serve this folder over HTTPS or localhost and ensure browser storage is enabled.</p></div>`;
    }
  }
  init();
})();
