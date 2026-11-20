/* Seller OS — app.js
   State, persistence, routing, CRUD, order flow, analytics.
   All data lives in localStorage under 'seller-os-v1'. All money in integer kyat. */

const LS_KEY = "seller-os-v1";
const LOW_STOCK_AT = 5;

const CATEGORIES = ["electronics", "accessories", "clothing", "food", "stationery", "beauty", "home"];
const EXPENSE_CATEGORIES = ["rent", "stock", "delivery", "marketing", "other"];
const PAYMENTS = ["cash", "kbz", "wave", "aya"];
const STATUSES = ["pending", "paid", "delivered", "cancelled"];
const VIEWS = ["dashboard", "products", "new-order", "orders", "customers", "expenses", "analytics", "data"];

/* ---------- storage (with in-memory fallback) ---------- */
let memoryStore = null;
function lsGet() {
  try { return window.localStorage.getItem(LS_KEY); } catch (e) { return memoryStore; }
}
function lsSet(v) {
  try { window.localStorage.setItem(LS_KEY, v); } catch (e) { memoryStore = v; }
}

/* ---------- helpers ---------- */
function uid(prefix) {
  return prefix + "-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 10000).toString(36);
}
function fmt(n) {
  return Number(n || 0).toLocaleString("en-US") + " Ks";
}
function todayISO() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(iso) {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  return Number(parts[2]) + " " + MONTHS[Number(parts[1]) - 1] + " " + parts[0];
}
function shortDayLabel(iso) {
  const parts = iso.split("-");
  return Number(parts[2]) + " " + MONTHS[Number(parts[1]) - 1];
}
function esc(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function $(id) { return document.getElementById(id); }

/* ---------- state ---------- */
let state = null;
let lang = "my";
let orderLines = [];
let toastTimer = null;

function emptyState() {
  return {
    products: [], customers: [], orders: [], expenses: [],
    seq: { order: 1001, product: 101 },
    settings: { lang: lang },
    demo: false
  };
}

function seed() {
  const s = emptyState();
  s.demo = true;
  const products = [
    { name: "Wireless Earbuds", category: "electronics", cost: 18000, price: 25000, stock: 14 },
    { name: "Phone Case", category: "accessories", cost: 3500, price: 6000, stock: 42 },
    { name: "Cotton T-Shirt", category: "clothing", cost: 8000, price: 12000, stock: 9 },
    { name: "Instant Coffee 100g", category: "food", cost: 4500, price: 7000, stock: 3 },
    { name: "Notebook A5", category: "stationery", cost: 1200, price: 2000, stock: 60 },
    { name: "Power Bank 10000mAh", category: "electronics", cost: 22000, price: 32000, stock: 6 },
    { name: "Shampoo 400ml", category: "beauty", cost: 6500, price: 9500, stock: 2 },
    { name: "Water Bottle 1L", category: "home", cost: 4000, price: 6500, stock: 25 }
  ];
  products.forEach(function (p) {
    s.products.push({
      id: uid("p"), name: p.name, category: p.category, cost: p.cost,
      price: p.price, stock: p.stock, sku: "SKU-" + (s.seq.product++)
    });
  });
  const P = {};
  s.products.forEach(function (p) { P[p.name] = p; });

  const customers = [
    { name: "Aung Kyaw", phone: "09 421 123 456", note: "Regular buyer" },
    { name: "May Thu", phone: "09 780 234 567", note: "" },
    { name: "Zaw Htet", phone: "09 430 345 678", note: "Prefers KBZPay" },
    { name: "Hnin Wai", phone: "09 250 456 789", note: "" },
    { name: "Ko Min", phone: "09 970 567 890", note: "Wholesale" },
    { name: "Su Mon", phone: "09 420 678 901", note: "" }
  ];
  customers.forEach(function (c) {
    s.customers.push({ id: uid("c"), name: c.name, phone: c.phone, note: c.note });
  });
  const C = {};
  s.customers.forEach(function (c) { C[c.name] = c; });

  function mkOrder(daysAgo, customerName, lines, payment, status) {
    const items = lines.map(function (ln) {
      const p = P[ln[0]];
      return { productId: p.id, name: p.name, price: p.price, qty: ln[1] };
    });
    const total = items.reduce(function (sum, it) { return sum + it.price * it.qty; }, 0);
    s.orders.push({
      id: uid("o"), number: "SO-" + (s.seq.order++), customerId: C[customerName].id,
      customerName: customerName, items: items, total: total,
      payment: payment, status: status, date: isoDaysAgo(daysAgo), createdAt: Date.now() - daysAgo * 86400000
    });
  }
  mkOrder(0, "Aung Kyaw", [["Wireless Earbuds", 1], ["Phone Case", 2]], "kbz", "paid");
  mkOrder(0, "May Thu", [["Cotton T-Shirt", 2]], "cash", "pending");
  mkOrder(1, "Zaw Htet", [["Power Bank 10000mAh", 1], ["Notebook A5", 5]], "wave", "delivered");
  mkOrder(2, "Hnin Wai", [["Instant Coffee 100g", 3], ["Water Bottle 1L", 1]], "cash", "paid");
  mkOrder(3, "Ko Min", [["Phone Case", 10], ["Notebook A5", 10]], "kbz", "paid");
  mkOrder(4, "Su Mon", [["Shampoo 400ml", 2]], "aya", "delivered");
  mkOrder(5, "Aung Kyaw", [["Water Bottle 1L", 2], ["Instant Coffee 100g", 2]], "cash", "cancelled");
  mkOrder(6, "May Thu", [["Wireless Earbuds", 1]], "wave", "delivered");
  mkOrder(8, "Zaw Htet", [["Cotton T-Shirt", 1], ["Phone Case", 1]], "kbz", "paid");
  mkOrder(9, "Hnin Wai", [["Notebook A5", 8]], "cash", "delivered");
  mkOrder(11, "Ko Min", [["Power Bank 10000mAh", 1], ["Shampoo 400ml", 1]], "kbz", "pending");
  mkOrder(13, "Su Mon", [["Instant Coffee 100g", 4], ["Water Bottle 1L", 2], ["Phone Case", 2]], "cash", "delivered");

  const expenses = [
    { title: "Shop rent", category: "rent", amount: 150000, daysAgo: 2 },
    { title: "Restock phone cases", category: "stock", amount: 120000, daysAgo: 4 },
    { title: "Delivery fees", category: "delivery", amount: 15000, daysAgo: 1 },
    { title: "Facebook ads", category: "marketing", amount: 30000, daysAgo: 6 },
    { title: "Packaging boxes", category: "other", amount: 12000, daysAgo: 8 },
    { title: "Restock coffee", category: "stock", amount: 45000, daysAgo: 10 },
    { title: "Delivery fees", category: "delivery", amount: 8000, daysAgo: 12 },
    { title: "Shop rent", category: "rent", amount: 150000, daysAgo: 20 }
  ];
  expenses.forEach(function (e) {
    s.expenses.push({ id: uid("x"), title: e.title, category: e.category, amount: e.amount, date: isoDaysAgo(e.daysAgo) });
  });
  return s;
}

function load() {
  const raw = lsGet();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.products) || !Array.isArray(parsed.orders) ||
        !Array.isArray(parsed.customers) || !Array.isArray(parsed.expenses)) return null;
    return parsed;
  } catch (e) { return null; }
}
function save() {
  state.settings.lang = lang;
  lsSet(JSON.stringify(state));
}

/* ---------- i18n ---------- */
function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach(function (el) {
    el.textContent = t(el.getAttribute("data-i18n"), lang);
  });
  document.querySelectorAll("[data-i18n-ph]").forEach(function (el) {
    el.setAttribute("placeholder", t(el.getAttribute("data-i18n-ph"), lang));
  });
  document.documentElement.lang = lang === "my" ? "my" : "en";
  $("langToggle").textContent = lang === "my" ? "English" : "မြန်မာ";
}

function showToast(msg) {
  const toast = $("toast");
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { toast.classList.remove("show"); }, 2600);
}

/* ---------- view routing ---------- */
let currentView = "dashboard";
function showView(name) {
  if (VIEWS.indexOf(name) === -1) name = "dashboard";
  currentView = name;
  VIEWS.forEach(function (v) {
    const sec = $("view-" + v);
    if (sec) sec.classList.toggle("active", v === name);
  });
  document.querySelectorAll(".nav-item").forEach(function (btn) {
    btn.classList.toggle("active", btn.getAttribute("data-view") === name);
  });
  const titleKey = name === "new-order" ? "order.newTitle" :
    name === "dashboard" ? "dashboard.title" :
    name === "products" ? "products.title" :
    name === "orders" ? "orders.title" :
    name === "customers" ? "customers.title" :
    name === "expenses" ? "expenses.title" :
    name === "analytics" ? "analytics.title" : "data.title";
  $("viewTitle").textContent = t(titleKey, lang);
  document.querySelector(".sidebar").classList.remove("open");
  if (location.hash !== "#" + name) history.replaceState(null, "", "#" + name);
  renderView(name);
}
function renderView(name) {
  if (name === "dashboard") renderDashboard();
  else if (name === "products") renderProducts();
  else if (name === "new-order") renderNewOrder();
  else if (name === "orders") renderOrders();
  else if (name === "customers") renderCustomers();
  else if (name === "expenses") renderExpenses();
  else if (name === "analytics") renderAnalytics();
}
function renderAll() {
  applyI18n();
  renderView(currentView);
}

/* ---------- shared lookups ---------- */
function productById(id) { return state.products.find(function (p) { return p.id === id; }); }
function customerById(id) { return state.customers.find(function (c) { return c.id === id; }); }
function activeOrders() { return state.orders.filter(function (o) { return o.status !== "cancelled"; }); }
function monthPrefix() { return todayISO().slice(0, 7); }

/* ---------- dashboard ---------- */
function renderDashboard() {
  const today = todayISO();
  const month = monthPrefix();
  const todayRevenue = activeOrders()
    .filter(function (o) { return o.date === today; })
    .reduce(function (s, o) { return s + o.total; }, 0);
  const monthRevenue = activeOrders()
    .filter(function (o) { return o.date.slice(0, 7) === month; })
    .reduce(function (s, o) { return s + o.total; }, 0);
  const monthExpenses = state.expenses
    .filter(function (e) { return e.date.slice(0, 7) === month; })
    .reduce(function (s, e) { return s + e.amount; }, 0);
  const pending = state.orders.filter(function (o) { return o.status === "pending"; }).length;
  const low = state.products.filter(function (p) { return p.stock <= LOW_STOCK_AT; });

  $("stat-today-revenue").textContent = fmt(todayRevenue);
  $("stat-month-profit").textContent = fmt(monthRevenue - monthExpenses);
  $("stat-pending-orders").textContent = String(pending);
  $("stat-low-stock").textContent = String(low.length);

  // Revenue line chart — last 14 days
  const days = [];
  const rev = [];
  for (let i = 13; i >= 0; i--) {
    const d = isoDaysAgo(i);
    days.push(shortDayLabel(d));
    rev.push(activeOrders().filter(function (o) { return o.date === d; })
      .reduce(function (s, o) { return s + o.total; }, 0));
  }
  drawMultiLineChart($("chart-revenue"), days, [{ label: t("analytics.revenue", lang), values: rev, color: CHART_COLORS.gold }]);

  // Top products by revenue
  const byProduct = {};
  activeOrders().forEach(function (o) {
    o.items.forEach(function (it) {
      byProduct[it.name] = (byProduct[it.name] || 0) + it.price * it.qty;
    });
  });
  const top = Object.keys(byProduct).map(function (n) { return { name: n, total: byProduct[n] }; })
    .sort(function (a, b) { return b.total - a.total; }).slice(0, 5);
  const topEl = $("top-products-list");
  if (!top.length) {
    topEl.innerHTML = '<p class="empty">' + esc(t("dashboard.noTopProducts", lang)) + "</p>";
  } else {
    topEl.innerHTML = top.map(function (row, i) {
      return '<div class="list-row"><span class="rank">' + (i + 1) + '</span><span class="list-name">' + esc(row.name) +
        '</span><span class="list-value">' + fmt(row.total) + "</span></div>";
    }).join("");
  }

  // Low stock alerts
  const lowEl = $("low-stock-list");
  if (!low.length) {
    lowEl.innerHTML = '<p class="empty">' + esc(t("dashboard.noLowStock", lang)) + "</p>";
  } else {
    lowEl.innerHTML = low.map(function (p) {
      return '<div class="list-row alert"><span class="list-name">' + esc(p.name) +
        '</span><span class="list-value">' + esc(t("dashboard.left", lang)) + ": " + p.stock + "</span></div>";
    }).join("");
  }

  // Recent orders
  const recent = state.orders.slice().sort(function (a, b) { return b.createdAt - a.createdAt; }).slice(0, 5);
  const recEl = $("recent-orders-list");
  if (!recent.length) {
    recEl.innerHTML = '<p class="empty">' + esc(t("dashboard.noRecentOrders", lang)) + "</p>";
  } else {
    recEl.innerHTML = recent.map(function (o) {
      return '<div class="list-row"><span class="list-name">' + esc(o.number) + " · " + esc(o.customerName) +
        '</span><span class="badge st-' + o.status + '">' + esc(t("status." + o.status, lang)) + "</span>" +
        '<span class="list-value">' + fmt(o.total) + "</span></div>";
    }).join("");
  }
}

/* ---------- products ---------- */
function productOptions(selected) {
  return CATEGORIES.map(function (c) {
    return '<option value="' + c + '"' + (c === selected ? " selected" : "") + ">" + esc(t("cat." + c, lang)) + "</option>";
  }).join("");
}
function renderProducts() {
  const q = $("product-search").value.trim().toLowerCase();
  const cat = $("product-category-filter").value;
  const rows = state.products.filter(function (p) {
    const matchQ = !q || p.name.toLowerCase().indexOf(q) !== -1 || (p.sku || "").toLowerCase().indexOf(q) !== -1;
    const matchC = !cat || p.category === cat;
    return matchQ && matchC;
  });
  const body = $("product-table-body");
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="8" class="empty-cell">' + esc(t("products.noProducts", lang)) + "</td></tr>";
    return;
  }
  body.innerHTML = rows.map(function (p) {
    const margin = p.price > 0 ? Math.round(((p.price - p.cost) / p.price) * 100) : 0;
    return "<tr>" +
      "<td>" + esc(p.name) + "</td>" +
      "<td>" + esc(t("cat." + p.category, lang)) + "</td>" +
      "<td>" + esc(p.sku || "") + "</td>" +
      "<td>" + fmt(p.cost) + "</td>" +
      "<td>" + fmt(p.price) + "</td>" +
      "<td class=\"" + (p.stock <= LOW_STOCK_AT ? "low" : "") + "\">" + p.stock + "</td>" +
      "<td>" + margin + "%</td>" +
      '<td class="row-actions">' +
      '<button class="btn small" data-edit-product="' + p.id + '">' + esc(t("common.edit", lang)) + "</button> " +
      '<button class="btn small danger" data-delete-product="' + p.id + '">' + esc(t("common.delete", lang)) + "</button>" +
      "</td></tr>";
  }).join("");
}
function openProductModal(id) {
  const p = id ? productById(id) : null;
  $("product-modal-title").textContent = t(p ? "products.editTitle" : "products.addTitle", lang);
  $("pf-id").value = p ? p.id : "";
  $("pf-name").value = p ? p.name : "";
  $("pf-category").value = p ? p.category : CATEGORIES[0];
  $("pf-cost").value = p ? p.cost : "";
  $("pf-price").value = p ? p.price : "";
  $("pf-stock").value = p ? p.stock : "";
  $("pf-sku").value = p ? (p.sku || "") : "";
  openModal("product-modal");
}
function saveProduct(e) {
  e.preventDefault();
  const id = $("pf-id").value;
  const name = $("pf-name").value.trim();
  const category = $("pf-category").value;
  const cost = Math.max(0, Math.round(Number($("pf-cost").value) || 0));
  const price = Math.max(0, Math.round(Number($("pf-price").value) || 0));
  const stock = Math.max(0, Math.round(Number($("pf-stock").value) || 0));
  if (!name) return;
  if (id) {
    const p = productById(id);
    if (p) { p.name = name; p.category = category; p.cost = cost; p.price = price; p.stock = stock; }
  } else {
    state.products.push({
      id: uid("p"), name: name, category: category, cost: cost, price: price,
      stock: stock, sku: "SKU-" + (state.seq.product++)
    });
  }
  save();
  closeModal("product-modal");
  renderProducts();
}
function deleteProduct(id) {
  if (!confirm(t("products.deleteConfirm", lang))) return;
  state.products = state.products.filter(function (p) { return p.id !== id; });
  save();
  renderProducts();
}

/* ---------- new order ---------- */
function renderNewOrder() {
  const custSel = $("order-customer");
  custSel.innerHTML = '<option value="">' + esc(t("order.selectCustomer", lang)) + "</option>" +
    state.customers.map(function (c) {
      return '<option value="' + c.id + '">' + esc(c.name) + " (" + esc(c.phone || "") + ")</option>";
    }).join("");
  const prodSel = $("order-product");
  prodSel.innerHTML = '<option value="">' + esc(t("order.selectProduct", lang)) + "</option>" +
    state.products.map(function (p) {
      return '<option value="' + p.id + '">' + esc(p.name) + " — " + fmt(p.price) +
        " (" + esc(t("products.stock", lang)) + ": " + p.stock + ")</option>";
    }).join("");
  renderLines();
}
function renderLines() {
  const body = $("order-lines-body");
  if (!orderLines.length) {
    body.innerHTML = '<tr><td colspan="5" class="empty-cell">' + esc(t("order.noLines", lang)) + "</td></tr>";
  } else {
    body.innerHTML = orderLines.map(function (ln, i) {
      return "<tr>" +
        "<td>" + esc(ln.name) + "</td>" +
        "<td>" + fmt(ln.price) + "</td>" +
        "<td>" + ln.qty + "</td>" +
        "<td>" + fmt(ln.price * ln.qty) + "</td>" +
        '<td><button class="btn small danger" data-remove-line="' + i + '">' + esc(t("common.delete", lang)) + "</button></td></tr>";
    }).join("");
  }
  const total = orderLines.reduce(function (s, ln) { return s + ln.price * ln.qty; }, 0);
  $("order-total").textContent = fmt(total);
}
function addLine() {
  const pid = $("order-product").value;
  const qty = Math.max(1, Math.round(Number($("order-qty").value) || 1));
  if (!pid) return;
  const p = productById(pid);
  if (!p) return;
  const existing = orderLines.find(function (ln) { return ln.productId === pid; });
  const already = existing ? existing.qty : 0;
  if (qty + already > p.stock) {
    showToast(t("order.outOfStock", lang) + " (" + esc(t("products.stock", lang)) + ": " + p.stock + ")");
    return;
  }
  if (existing) existing.qty += qty;
  else orderLines.push({ productId: pid, name: p.name, price: p.price, qty: qty });
  renderLines();
}
function saveOrder() {
  if (!orderLines.length) { showToast(t("order.needProduct", lang)); return; }
  let customerId = $("order-customer").value;
  let customerName = "";
  const newName = $("order-new-name").value.trim();
  if (customerId) {
    const c = customerById(customerId);
    customerName = c ? c.name : "";
  } else if (newName) {
    const nc = { id: uid("c"), name: newName, phone: $("order-new-phone").value.trim(), note: "" };
    state.customers.push(nc);
    customerId = nc.id;
    customerName = newName;
  } else {
    showToast(t("order.needCustomer", lang));
    return;
  }
  const total = orderLines.reduce(function (s, ln) { return s + ln.price * ln.qty; }, 0);
  const order = {
    id: uid("o"), number: "SO-" + (state.seq.order++), customerId: customerId,
    customerName: customerName,
    items: orderLines.map(function (ln) { return { productId: ln.productId, name: ln.name, price: ln.price, qty: ln.qty }; }),
    total: total, payment: $("order-payment").value, status: $("order-status").value,
    date: todayISO(), createdAt: Date.now()
  };
  orderLines.forEach(function (ln) {
    const p = productById(ln.productId);
    if (p) p.stock = Math.max(0, p.stock - ln.qty);
  });
  state.orders.push(order);
  save();
  orderLines = [];
  $("order-new-name").value = "";
  $("order-new-phone").value = "";
  $("order-qty").value = "1";
  renderNewOrder();
  showToast(t("order.saved", lang) + " " + order.number);
  showView("orders");
}

/* ---------- orders ---------- */
function renderOrders() {
  const filter = $("order-status-filter").value;
  const rows = state.orders.slice().sort(function (a, b) { return b.createdAt - a.createdAt; })
    .filter(function (o) { return !filter || o.status === filter; });
  const body = $("orders-table-body");
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="7" class="empty-cell">' + esc(t("orders.noOrders", lang)) + "</td></tr>";
    return;
  }
  body.innerHTML = rows.map(function (o) {
    const canCancel = o.status === "pending" || o.status === "paid";
    return "<tr>" +
      "<td>" + esc(o.number) + "</td>" +
      "<td>" + fmtDate(o.date) + "</td>" +
      "<td>" + esc(o.customerName) + "</td>" +
      "<td>" + fmt(o.total) + "</td>" +
      "<td>" + esc(t("pay." + o.payment, lang)) + "</td>" +
      '<td><select class="status-select" data-order-status="' + o.id + '">' +
      STATUSES.map(function (st) {
        return '<option value="' + st + '"' + (st === o.status ? " selected" : "") + ">" + esc(t("status." + st, lang)) + "</option>";
      }).join("") + "</select></td>" +
      '<td class="row-actions">' +
      '<button class="btn small" data-view-order="' + o.id + '">' + esc(t("orders.view", lang)) + "</button> " +
      (canCancel ? '<button class="btn small danger" data-cancel-order="' + o.id + '">' + esc(t("orders.cancel", lang)) + "</button>" : "") +
      "</td></tr>";
  }).join("");
}
function setOrderStatus(id, status) {
  const o = state.orders.find(function (x) { return x.id === id; });
  if (!o) return;
  if (o.status === "cancelled" && status !== "cancelled") {
    // Restoring a cancelled order would need stock again; keep it simple: disallow.
    renderOrders();
    return;
  }
  o.status = status;
  save();
  showToast(t("orders.statusChanged", lang));
  renderOrders();
}
function cancelOrder(id) {
  const o = state.orders.find(function (x) { return x.id === id; });
  if (!o || o.status === "cancelled" || o.status === "delivered") return;
  if (!confirm(t("orders.cancelConfirm", lang))) return;
  o.items.forEach(function (it) {
    const p = productById(it.productId);
    if (p) p.stock += it.qty;
  });
  o.status = "cancelled";
  save();
  showToast(t("orders.cancelled", lang));
  renderOrders();
}
function viewOrder(id) {
  const o = state.orders.find(function (x) { return x.id === id; });
  if (!o) return;
  $("order-detail").innerHTML =
    '<div class="detail-head"><div><strong>' + esc(o.number) + '</strong><br>' +
    '<span class="muted">' + fmtDate(o.date) + " · " + esc(o.customerName) + "</span></div>" +
    '<span class="badge st-' + o.status + '">' + esc(t("status." + o.status, lang)) + "</span></div>" +
    '<table class="table"><thead><tr><th>' + esc(t("order.item", lang)) + "</th><th>" + esc(t("order.unitPrice", lang)) +
    "</th><th>" + esc(t("order.qty", lang)) + "</th><th>" + esc(t("order.lineTotal", lang)) + "</th></tr></thead><tbody>" +
    o.items.map(function (it) {
      return "<tr><td>" + esc(it.name) + "</td><td>" + fmt(it.price) + "</td><td>" + it.qty + "</td><td>" + fmt(it.price * it.qty) + "</td></tr>";
    }).join("") + "</tbody></table>" +
    '<div class="detail-foot"><span>' + esc(t("order.payment", lang)) + ": " + esc(t("pay." + o.payment, lang)) + "</span>" +
    "<strong>" + esc(t("order.total", lang)) + ": " + fmt(o.total) + "</strong></div>";
  openModal("order-modal");
}

/* ---------- customers ---------- */
function renderCustomers() {
  const q = $("customer-search").value.trim().toLowerCase();
  const rows = state.customers.filter(function (c) {
    return !q || c.name.toLowerCase().indexOf(q) !== -1 || (c.phone || "").indexOf(q) !== -1;
  });
  const body = $("customers-table-body");
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="6" class="empty-cell">' + esc(t("customers.noCustomers", lang)) + "</td></tr>";
    return;
  }
  body.innerHTML = rows.map(function (c) {
    const spent = activeOrders().filter(function (o) { return o.customerId === c.id; });
    const total = spent.reduce(function (s, o) { return s + o.total; }, 0);
    return "<tr>" +
      "<td>" + esc(c.name) + "</td>" +
      "<td>" + esc(c.phone || "") + "</td>" +
      "<td>" + esc(c.note || "") + "</td>" +
      "<td>" + spent.length + "</td>" +
      "<td>" + fmt(total) + "</td>" +
      '<td class="row-actions">' +
      '<button class="btn small" data-edit-customer="' + c.id + '">' + esc(t("common.edit", lang)) + "</button> " +
      '<button class="btn small danger" data-delete-customer="' + c.id + '">' + esc(t("common.delete", lang)) + "</button>" +
      "</td></tr>";
  }).join("");
}
function openCustomerModal(id) {
  const c = id ? customerById(id) : null;
  $("customer-modal-title").textContent = t(c ? "customers.editTitle" : "customers.addTitle", lang);
  $("cf-id").value = c ? c.id : "";
  $("cf-name").value = c ? c.name : "";
  $("cf-phone").value = c ? (c.phone || "") : "";
  $("cf-note").value = c ? (c.note || "") : "";
  openModal("customer-modal");
}
function saveCustomer(e) {
  e.preventDefault();
  const id = $("cf-id").value;
  const name = $("cf-name").value.trim();
  if (!name) return;
  if (id) {
    const c = customerById(id);
    if (c) { c.name = name; c.phone = $("cf-phone").value.trim(); c.note = $("cf-note").value.trim(); }
  } else {
    state.customers.push({ id: uid("c"), name: name, phone: $("cf-phone").value.trim(), note: $("cf-note").value.trim() });
  }
  save();
  closeModal("customer-modal");
  renderCustomers();
}
function deleteCustomer(id) {
  if (!confirm(t("customers.deleteConfirm", lang))) return;
  state.customers = state.customers.filter(function (c) { return c.id !== id; });
  save();
  renderCustomers();
}

/* ---------- expenses ---------- */
function renderExpenses() {
  const month = monthPrefix();
  const total = state.expenses
    .filter(function (e) { return e.date.slice(0, 7) === month; })
    .reduce(function (s, e) { return s + e.amount; }, 0);
  $("expense-month-total").textContent = fmt(total);
  const rows = state.expenses.slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
  const body = $("expenses-table-body");
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="5" class="empty-cell">' + esc(t("expenses.noExpenses", lang)) + "</td></tr>";
    return;
  }
  body.innerHTML = rows.map(function (e) {
    return "<tr>" +
      "<td>" + esc(e.title) + "</td>" +
      "<td>" + esc(t("exp." + e.category, lang)) + "</td>" +
      "<td>" + fmt(e.amount) + "</td>" +
      "<td>" + fmtDate(e.date) + "</td>" +
      '<td><button class="btn small danger" data-delete-expense="' + e.id + '">' + esc(t("common.delete", lang)) + "</button></td></tr>";
  }).join("");
}
function addExpense(e) {
  e.preventDefault();
  const title = $("ef-title").value.trim();
  const amount = Math.max(0, Math.round(Number($("ef-amount").value) || 0));
  if (!title || amount <= 0) return;
  state.expenses.push({
    id: uid("x"), title: title, category: $("ef-category").value,
    amount: amount, date: $("ef-date").value || todayISO()
  });
  save();
  $("ef-title").value = "";
  $("ef-amount").value = "";
  renderExpenses();
}
function deleteExpense(id) {
  if (!confirm(t("expenses.deleteConfirm", lang))) return;
  state.expenses = state.expenses.filter(function (x) { return x.id !== id; });
  save();
  renderExpenses();
}

/* ---------- analytics ---------- */
function renderAnalytics() {
  // Last 30 days: revenue, expenses, profit
  const days = [];
  const rev = [];
  const exp = [];
  const prof = [];
  for (let i = 29; i >= 0; i--) {
    const d = isoDaysAgo(i);
    days.push(shortDayLabel(d));
    const r = activeOrders().filter(function (o) { return o.date === d; })
      .reduce(function (s, o) { return s + o.total; }, 0);
    const x = state.expenses.filter(function (e) { return e.date === d; })
      .reduce(function (s, e) { return s + e.amount; }, 0);
    rev.push(r);
    exp.push(x);
    prof.push(r - x);
  }
  drawMultiLineChart($("chart-profit"), days, [
    { label: t("analytics.revenue", lang), values: rev, color: CHART_COLORS.gold },
    { label: t("analytics.expenses", lang), values: exp, color: CHART_COLORS.slate },
    { label: t("analytics.profit", lang), values: prof, color: CHART_COLORS.green }
  ], 240);

  // Top 5 products by qty sold
  const byQty = {};
  activeOrders().forEach(function (o) {
    o.items.forEach(function (it) {
      byQty[it.name] = (byQty[it.name] || 0) + it.qty;
    });
  });
  const top = Object.keys(byQty).map(function (n) { return { name: n, qty: byQty[n] }; })
    .sort(function (a, b) { return b.qty - a.qty; }).slice(0, 5);
  drawBarChart($("chart-top-products"), top.map(function (r) { return r.name; }), top.map(function (r) { return r.qty; }), CHART_COLORS.gold, 220);

  // Sales by category (revenue)
  const byCat = {};
  activeOrders().forEach(function (o) {
    o.items.forEach(function (it) {
      const p = productById(it.productId);
      const cat = p ? p.category : "other";
      byCat[cat] = (byCat[cat] || 0) + it.price * it.qty;
    });
  });
  const catSegs = Object.keys(byCat).map(function (c, i) {
    return { label: t("cat." + c, lang), value: byCat[c], color: DONUT_PALETTE[i % DONUT_PALETTE.length] };
  }).sort(function (a, b) { return b.value - a.value; });
  drawDonut($("chart-category"), catSegs, t("analytics.revenue", lang));

  // Sales by payment method (revenue)
  const byPay = {};
  activeOrders().forEach(function (o) {
    byPay[o.payment] = (byPay[o.payment] || 0) + o.total;
  });
  const paySegs = Object.keys(byPay).map(function (p, i) {
    return { label: t("pay." + p, lang), value: byPay[p], color: DONUT_PALETTE[i % DONUT_PALETTE.length] };
  }).sort(function (a, b) { return b.value - a.value; });
  drawDonut($("chart-payment"), paySegs, t("analytics.revenue", lang));
}

/* ---------- data ---------- */
function downloadFile(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 500);
}
function exportJSON() {
  downloadFile("seller-os-backup-" + todayISO() + ".json", JSON.stringify(state, null, 2), "application/json");
  $("data-status").textContent = t("data.exportJson", lang) + " — OK";
}
function exportCSV() {
  const header = "Order No.,Date,Customer,Items,Total (Ks),Payment,Status\n";
  const rows = state.orders.map(function (o) {
    const items = o.items.map(function (it) { return it.name + " x" + it.qty; }).join("; ");
    function q(v) { return '"' + String(v).replace(/"/g, '""') + '"'; }
    return [o.number, o.date, o.customerName, items, o.total, t("pay." + o.payment, "en"), o.status]
      .map(q).join(",");
  });
  downloadFile("seller-os-orders-" + todayISO() + ".csv", header + rows.join("\n"), "text/csv");
  $("data-status").textContent = t("data.exportCsv", lang) + " — OK";
}
function importJSON(file) {
  const reader = new FileReader();
  reader.onload = function () {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed || !Array.isArray(parsed.products) || !Array.isArray(parsed.orders) ||
          !Array.isArray(parsed.customers) || !Array.isArray(parsed.expenses)) {
        throw new Error("bad shape");
      }
      state = parsed;
      if (!state.seq) state.seq = { order: 1001, product: 101 };
      if (!state.settings) state.settings = { lang: lang };
      lang = state.settings.lang || lang;
      save();
      renderAll();
      showToast(t("data.imported", lang));
    } catch (e) {
      showToast(t("data.importError", lang));
    }
  };
  reader.readAsText(file);
}
function resetData() {
  if (!confirm(t("data.resetConfirm", lang))) return;
  state = seed();
  save();
  renderAll();
  showToast(t("data.resetDone", lang));
}
function clearDemo() {
  if (!confirm(t("data.clearDemoConfirm", lang))) return;
  state = emptyState();
  save();
  renderAll();
  showToast(t("data.demoCleared", lang));
}

/* ---------- modals ---------- */
function openModal(id) { $(id).classList.add("open"); }
function closeModal(id) { $(id).classList.remove("open"); }

/* ---------- init ---------- */
function fillStaticSelects() {
  $("pf-category").innerHTML = productOptions("");
  $("product-category-filter").innerHTML =
    '<option value="">' + esc(t("products.allCategories", lang)) + "</option>" + productOptions("");
  $("order-payment").innerHTML = PAYMENTS.map(function (p) {
    return '<option value="' + p + '">' + esc(t("pay." + p, lang)) + "</option>";
  }).join("");
  $("order-status").innerHTML = STATUSES.filter(function (s) { return s !== "cancelled"; }).map(function (s) {
    return '<option value="' + s + '">' + esc(t("status." + s, lang)) + "</option>";
  }).join("");
  $("order-status-filter").innerHTML =
    '<option value="">' + esc(t("orders.allStatuses", lang)) + "</option>" +
    STATUSES.map(function (s) {
      return '<option value="' + s + '">' + esc(t("status." + s, lang)) + "</option>";
    }).join("");
  $("ef-category").innerHTML = EXPENSE_CATEGORIES.map(function (c) {
    return '<option value="' + c + '">' + esc(t("exp." + c, lang)) + "</option>";
  }).join("");
  $("ef-date").value = todayISO();
}

function bindEvents() {
  document.querySelectorAll(".nav-item").forEach(function (btn) {
    btn.addEventListener("click", function () { showView(btn.getAttribute("data-view")); });
  });
  $("menuToggle").addEventListener("click", function () {
    document.querySelector(".sidebar").classList.toggle("open");
  });
  $("langToggle").addEventListener("click", function () {
    lang = lang === "my" ? "en" : "my";
    save();
    fillStaticSelects();
    renderAll();
  });

  // Products
  $("btn-add-product").addEventListener("click", function () { openProductModal(null); });
  $("product-form").addEventListener("submit", saveProduct);
  $("product-search").addEventListener("input", renderProducts);
  $("product-category-filter").addEventListener("change", renderProducts);
  $("product-table-body").addEventListener("click", function (e) {
    const eb = e.target.closest("[data-edit-product]");
    const db = e.target.closest("[data-delete-product]");
    if (eb) openProductModal(eb.getAttribute("data-edit-product"));
    if (db) deleteProduct(db.getAttribute("data-delete-product"));
  });

  // New order
  $("btn-add-line").addEventListener("click", addLine);
  $("order-lines-body").addEventListener("click", function (e) {
    const rb = e.target.closest("[data-remove-line]");
    if (rb) {
      orderLines.splice(Number(rb.getAttribute("data-remove-line")), 1);
      renderLines();
    }
  });
  $("btn-save-order").addEventListener("click", saveOrder);
  $("btn-clear-order").addEventListener("click", function () {
    orderLines = [];
    $("order-new-name").value = "";
    $("order-new-phone").value = "";
    renderLines();
  });

  // Orders
  $("order-status-filter").addEventListener("change", renderOrders);
  $("orders-table-body").addEventListener("click", function (e) {
    const vb = e.target.closest("[data-view-order]");
    const cb = e.target.closest("[data-cancel-order]");
    if (vb) viewOrder(vb.getAttribute("data-view-order"));
    if (cb) cancelOrder(cb.getAttribute("data-cancel-order"));
  });
  $("orders-table-body").addEventListener("change", function (e) {
    const sel = e.target.closest("[data-order-status]");
    if (sel) setOrderStatus(sel.getAttribute("data-order-status"), sel.value);
  });

  // Customers
  $("btn-add-customer").addEventListener("click", function () { openCustomerModal(null); });
  $("customer-form").addEventListener("submit", saveCustomer);
  $("customer-search").addEventListener("input", renderCustomers);
  $("customers-table-body").addEventListener("click", function (e) {
    const eb = e.target.closest("[data-edit-customer]");
    const db = e.target.closest("[data-delete-customer]");
    if (eb) openCustomerModal(eb.getAttribute("data-edit-customer"));
    if (db) deleteCustomer(db.getAttribute("data-delete-customer"));
  });

  // Expenses
  $("btn-add-expense").addEventListener("click", addExpense);
  $("expenses-table-body").addEventListener("click", function (e) {
    const db = e.target.closest("[data-delete-expense]");
    if (db) deleteExpense(db.getAttribute("data-delete-expense"));
  });

  // Data
  $("btn-export-json").addEventListener("click", exportJSON);
  $("btn-export-csv").addEventListener("click", exportCSV);
  $("btn-import-json").addEventListener("click", function () { $("import-file").click(); });
  $("import-file").addEventListener("change", function (e) {
    if (e.target.files && e.target.files[0]) importJSON(e.target.files[0]);
    e.target.value = "";
  });
  $("btn-reset-data").addEventListener("click", resetData);
  $("btn-clear-demo").addEventListener("click", clearDemo);

  // Modals: close buttons + overlay click + Escape
  document.querySelectorAll("[data-close]").forEach(function (btn) {
    btn.addEventListener("click", function () { closeModal(btn.getAttribute("data-close")); });
  });
  document.querySelectorAll(".modal-overlay").forEach(function (ov) {
    ov.addEventListener("click", function (e) {
      if (e.target === ov) ov.classList.remove("open");
    });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") document.querySelectorAll(".modal-overlay.open").forEach(function (ov) { ov.classList.remove("open"); });
  });

  // Re-draw charts on resize (only the visible view's charts)
  let resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { renderView(currentView); }, 200);
  });
}

function init() {
  state = load();
  if (!state) {
    state = seed();
    save();
  }
  lang = (state.settings && state.settings.lang) || "my";
  fillStaticSelects();
  bindEvents();
  applyI18n();
  const hash = (location.hash || "").replace("#", "");
  showView(VIEWS.indexOf(hash) !== -1 ? hash : "dashboard");
}

document.addEventListener("DOMContentLoaded", init);
