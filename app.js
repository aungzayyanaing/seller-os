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

/* ---------- Iconography (inline SVG, one consistent stroke style) ----------
   The UI uses icons, never emojis. Every icon is a 24x24 outline glyph:
   stroke=currentColor, stroke-width 2, round caps/joins, no fill.
   Single source of truth: icon(name) builds the <svg>; static spots mark
   themselves with data-icon="name" and applyI18n() injects the markup. */
const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  package: '<path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  "plus-circle": '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>',
  receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="13" y2="15"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  "trending-down": '<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>',
  "trending-up": '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
  chart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
  banknote: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  menu: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  edit: '<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  refresh: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  "check-circle": '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  "pie-chart": '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
  "file-text": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  "credit-card": '<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>'
};
function icon(name) {
  return '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || "") + "</svg>";
}

/* ---------- i18n ---------- */
function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach(function (el) {
    el.textContent = t(el.getAttribute("data-i18n"), lang);
    /* Icons live beside the label: textContent wipes children, so the
       icon is (re-)injected after every language switch. */
    const ic = el.getAttribute("data-icon");
    if (ic) el.insertAdjacentHTML("afterbegin", icon(ic));
  });
  document.querySelectorAll("[data-i18n-ph]").forEach(function (el) {
    el.setAttribute("placeholder", t(el.getAttribute("data-i18n-ph"), lang));
    el.setAttribute("aria-label", t(el.getAttribute("data-i18n-ph"), lang));
  });
  /* Static icon slots (no label to translate): fill once, never duplicate. */
  document.querySelectorAll("[data-icon]").forEach(function (el) {
    if (!el.getAttribute("data-i18n") && !el.innerHTML) {
      el.innerHTML = icon(el.getAttribute("data-icon"));
    }
  });
  document.documentElement.lang = lang === "my" ? "my" : "en";
  $("langToggle").innerHTML = icon("globe") + "<span>" + (lang === "my" ? "English" : "မြန်မာ") + "</span>";
}

function showToast(msg, kind) {
  const toast = $("toast");
  const ic = kind === "warn" ? "alert" : "check-circle";
  toast.innerHTML = icon(ic) + "<span>" + esc(msg) + "</span>";
  toast.classList.toggle("warn", kind === "warn");
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { toast.classList.remove("show"); }, 2600);
}

/* ---------- view routing ---------- */
let currentView = "dashboard";

/* The topbar title is not a data-i18n element, so the language toggle
   (which only runs applyI18n + renderView) used to leave it stuck in the
   old language. Keep it in one helper and call it on every render. */
function updateViewTitle() {
  const titleKey = currentView === "new-order" ? "order.newTitle" :
    currentView === "dashboard" ? "dashboard.title" :
    currentView === "products" ? "products.title" :
    currentView === "orders" ? "orders.title" :
    currentView === "customers" ? "customers.title" :
    currentView === "expenses" ? "expenses.title" :
    currentView === "analytics" ? "analytics.title" : "data.title";
  $("viewTitle").textContent = t(titleKey, lang);
}
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
  updateViewTitle();
  document.querySelector(".sidebar").classList.remove("open");
  $("scrim").classList.remove("show");
  $("menuToggle").setAttribute("aria-expanded", "false");
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
  updateViewTitle();
  renderView(currentView);
}

/* ---------- shared lookups ---------- */
function productById(id) { return state.products.find(function (p) { return p.id === id; }); }
function customerById(id) { return state.customers.find(function (c) { return c.id === id; }); }
function activeOrders() { return state.orders.filter(function (o) { return o.status !== "cancelled"; }); }
function orderCost(o) {
  // Cost of goods sold for one order, using each product's current cost.
  // Order items store the sale-time price but not the cost, so current cost
  // is the best available figure; deleted products count as 0 cost.
  return o.items.reduce(function (s, it) {
    const p = productById(it.productId);
    return s + (p ? p.cost : 0) * it.qty;
  }, 0);
}
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
  const monthCogs = activeOrders()
    .filter(function (o) { return o.date.slice(0, 7) === month; })
    .reduce(function (s, o) { return s + orderCost(o); }, 0);
  const monthExpenses = state.expenses
    .filter(function (e) { return e.date.slice(0, 7) === month; })
    .reduce(function (s, e) { return s + e.amount; }, 0);
  const pending = state.orders.filter(function (o) { return o.status === "pending"; }).length;
  const low = state.products.filter(function (p) { return p.stock <= LOW_STOCK_AT; });

  const monthProfit = monthRevenue - monthCogs - monthExpenses;
  $("stat-today-revenue").textContent = fmt(todayRevenue);
  const profitEl = $("stat-month-profit");
  profitEl.textContent = fmt(monthProfit);
  /* Profit sign is meaning, not decoration: red when losing, green when gaining. */
  profitEl.classList.toggle("negative", monthProfit < 0);
  profitEl.classList.toggle("positive", monthProfit > 0);
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
    topEl.innerHTML = '<p class="empty">' + icon("star") + esc(t("dashboard.noTopProducts", lang)) + "</p>";
  } else {
    topEl.innerHTML = top.map(function (row, i) {
      return '<div class="list-row"><span class="rank">' + (i + 1) + '</span><span class="list-name">' + esc(row.name) +
        '</span><span class="list-value">' + fmt(row.total) + "</span></div>";
    }).join("");
  }

  // Low stock alerts
  const lowEl = $("low-stock-list");
  if (!low.length) {
    lowEl.innerHTML = '<p class="empty">' + icon("alert") + esc(t("dashboard.noLowStock", lang)) + "</p>";
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
    recEl.innerHTML = '<p class="empty">' + icon("clock") + esc(t("dashboard.noRecentOrders", lang)) + "</p>";
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
    body.innerHTML = '<tr><td colspan="8" class="empty-cell">' + icon("package") + esc(t("products.noProducts", lang)) + "</td></tr>";
    return;
  }
  body.innerHTML = rows.map(function (p) {
    const margin = p.price > 0 ? Math.round(((p.price - p.cost) / p.price) * 100) : 0;
    return "<tr>" +
      "<td>" + esc(p.name) + "</td>" +
      "<td>" + esc(t("cat." + p.category, lang)) + "</td>" +
      "<td>" + esc(p.sku || "") + "</td>" +
      '<td class="num">' + fmt(p.cost) + "</td>" +
      '<td class="num">' + fmt(p.price) + "</td>" +
      '<td class="num ' + (p.stock <= LOW_STOCK_AT ? "low" : "") + '">' + p.stock + "</td>" +
      '<td class="num">' + margin + "%</td>" +
      '<td class="row-actions">' +
      '<button class="btn small" data-edit-product="' + p.id + '">' + icon("edit") + esc(t("common.edit", lang)) + "</button> " +
      '<button class="btn small danger" data-delete-product="' + p.id + '">' + icon("trash") + esc(t("common.delete", lang)) + "</button>" +
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
  $("pf-name").focus();
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
  showToast(t("products.saved", lang));
}
function deleteProduct(id) {
  if (!confirm(t("products.deleteConfirm", lang))) return;
  state.products = state.products.filter(function (p) { return p.id !== id; });
  save();
  renderProducts();
}

/* ---------- new order ---------- */
/* Rebuilding the selects wipes an in-progress choice (and the debounced
   resize re-render hits this too), so snapshot and restore the picks. */
function renderNewOrder() {
  const keepCust = $("order-customer").value;
  const keepProd = $("order-product").value;
  const custSel = $("order-customer");
  custSel.innerHTML = '<option value="">' + esc(t("order.selectCustomer", lang)) + "</option>" +
    state.customers.map(function (c) {
      return '<option value="' + c.id + '">' + esc(c.name) + " (" + esc(c.phone || "") + ")</option>";
    }).join("");
  if (keepCust) custSel.value = keepCust;
  const prodSel = $("order-product");
  prodSel.innerHTML = '<option value="">' + esc(t("order.selectProduct", lang)) + "</option>" +
    state.products.map(function (p) {
      return '<option value="' + p.id + '">' + esc(p.name) + " — " + fmt(p.price) +
        " (" + esc(t("products.stock", lang)) + ": " + p.stock + ")</option>";
    }).join("");
  if (keepProd) prodSel.value = keepProd;
  renderLines();
}
function renderLines() {
  const body = $("order-lines-body");
  if (!orderLines.length) {
    body.innerHTML = '<tr><td colspan="5" class="empty-cell">' + icon("receipt") + esc(t("order.noLines", lang)) + "</td></tr>";
  } else {
    body.innerHTML = orderLines.map(function (ln, i) {
      return "<tr>" +
        "<td>" + esc(ln.name) + "</td>" +
        '<td class="num">' + fmt(ln.price) + "</td>" +
        '<td class="num">' + ln.qty + "</td>" +
        '<td class="num">' + fmt(ln.price * ln.qty) + "</td>" +
        '<td><button class="btn small danger" data-remove-line="' + i + '">' + icon("trash") + esc(t("common.delete", lang)) + "</button></td></tr>";
    }).join("");
  }
  const total = orderLines.reduce(function (s, ln) { return s + ln.price * ln.qty; }, 0);
  $("order-total").textContent = fmt(total);
}
function addLine() {
  const pid = $("order-product").value;
  const qty = Math.max(1, Math.round(Number($("order-qty").value) || 1));
  if (!pid) { showToast(t("order.chooseProduct", lang), "warn"); return; }
  const p = productById(pid);
  if (!p) return;
  const existing = orderLines.find(function (ln) { return ln.productId === pid; });
  const already = existing ? existing.qty : 0;
  if (qty + already > p.stock) {
    showToast(t("order.outOfStock", lang) + " (" + esc(t("products.stock", lang)) + ": " + p.stock + ")", "warn");
    return;
  }
  if (existing) existing.qty += qty;
  else orderLines.push({ productId: pid, name: p.name, price: p.price, qty: qty });
  renderLines();
}
function saveOrder() {
  if (!orderLines.length) { showToast(t("order.needProduct", lang), "warn"); return; }
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
    showToast(t("order.needCustomer", lang), "warn");
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
    body.innerHTML = '<tr><td colspan="7" class="empty-cell">' + icon("receipt") + esc(t("orders.noOrders", lang)) + "</td></tr>";
    return;
  }
  body.innerHTML = rows.map(function (o) {
    const canCancel = o.status === "pending" || o.status === "paid";
    return "<tr>" +
      "<td>" + esc(o.number) + "</td>" +
      "<td>" + fmtDate(o.date) + "</td>" +
      "<td>" + esc(o.customerName) + "</td>" +
      '<td class="num">' + fmt(o.total) + "</td>" +
      "<td>" + esc(t("pay." + o.payment, lang)) + "</td>" +
      '<td><select class="status-select" data-order-status="' + o.id + '">' +
      STATUSES.map(function (st) {
        return '<option value="' + st + '"' + (st === o.status ? " selected" : "") + ">" + esc(t("status." + st, lang)) + "</option>";
      }).join("") + "</select></td>" +
      '<td class="row-actions">' +
      '<button class="btn small" data-view-order="' + o.id + '">' + icon("eye") + esc(t("orders.view", lang)) + "</button> " +
      (canCancel ? '<button class="btn small danger" data-cancel-order="' + o.id + '">' + icon("x") + esc(t("orders.cancel", lang)) + "</button>" : "") +
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
    '<table class="table"><thead><tr><th>' + esc(t("order.item", lang)) + "</th><th class=\"num\">" + esc(t("order.unitPrice", lang)) +
    "</th><th class=\"num\">" + esc(t("order.qty", lang)) + "</th><th class=\"num\">" + esc(t("order.lineTotal", lang)) + "</th></tr></thead><tbody>" +
    o.items.map(function (it) {
      return "<tr><td>" + esc(it.name) + '</td><td class="num">' + fmt(it.price) + '</td><td class="num">' + it.qty + '</td><td class="num">' + fmt(it.price * it.qty) + "</td></tr>";
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
    body.innerHTML = '<tr><td colspan="6" class="empty-cell">' + icon("users") + esc(t("customers.noCustomers", lang)) + "</td></tr>";
    return;
  }
  body.innerHTML = rows.map(function (c) {
    const spent = activeOrders().filter(function (o) { return o.customerId === c.id; });
    const total = spent.reduce(function (s, o) { return s + o.total; }, 0);
    return "<tr>" +
      "<td>" + esc(c.name) + "</td>" +
      "<td>" + esc(c.phone || "") + "</td>" +
      "<td>" + esc(c.note || "") + "</td>" +
      '<td class="num">' + spent.length + "</td>" +
      '<td class="num">' + fmt(total) + "</td>" +
      '<td class="row-actions">' +
      '<button class="btn small" data-edit-customer="' + c.id + '">' + icon("edit") + esc(t("common.edit", lang)) + "</button> " +
      '<button class="btn small danger" data-delete-customer="' + c.id + '">' + icon("trash") + esc(t("common.delete", lang)) + "</button>" +
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
  $("cf-name").focus();
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
    body.innerHTML = '<tr><td colspan="5" class="empty-cell">' + icon("trending-down") + esc(t("expenses.noExpenses", lang)) + "</td></tr>";
    return;
  }
  body.innerHTML = rows.map(function (e) {
    return "<tr>" +
      "<td>" + esc(e.title) + "</td>" +
      "<td>" + esc(t("exp." + e.category, lang)) + "</td>" +
      '<td class="num">' + fmt(e.amount) + "</td>" +
      "<td>" + fmtDate(e.date) + "</td>" +
      '<td><button class="btn small danger" data-delete-expense="' + e.id + '">' + icon("trash") + esc(t("common.delete", lang)) + "</button></td></tr>";
  }).join("");
}
function addExpense(e) {
  e.preventDefault();
  const title = $("ef-title").value.trim();
  const amount = Math.max(0, Math.round(Number($("ef-amount").value) || 0));
  if (!title || amount <= 0) { showToast(t("expenses.invalid", lang), "warn"); return; }
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
    const dayOrders = activeOrders().filter(function (o) { return o.date === d; });
    const r = dayOrders.reduce(function (s, o) { return s + o.total; }, 0);
    const c = dayOrders.reduce(function (s, o) { return s + orderCost(o); }, 0);
    const x = state.expenses.filter(function (e) { return e.date === d; })
      .reduce(function (s, e) { return s + e.amount; }, 0);
    rev.push(r);
    exp.push(x);
    prof.push(r - c - x);
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
  drawDonut($("chart-category"), catSegs, t("analytics.revenue", lang), t("analytics.noData", lang));

  // Sales by payment method (revenue)
  const byPay = {};
  activeOrders().forEach(function (o) {
    byPay[o.payment] = (byPay[o.payment] || 0) + o.total;
  });
  const paySegs = Object.keys(byPay).map(function (p, i) {
    return { label: t("pay." + p, lang), value: byPay[p], color: DONUT_PALETTE[i % DONUT_PALETTE.length] };
  }).sort(function (a, b) { return b.value - a.value; });
  drawDonut($("chart-payment"), paySegs, t("analytics.revenue", lang), t("analytics.noData", lang));
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
      showToast(t("data.importError", lang), "warn");
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
/* Rebuilding a <select>'s options resets its selection in the browser, so
   a language toggle used to silently clear every filter. Snapshot the
   selections first, rebuild, then restore what still exists. */
function fillStaticSelects() {
  const keep = {};
  ["pf-category", "product-category-filter", "order-payment", "order-status", "order-status-filter", "ef-category"].forEach(function (id) {
    keep[id] = $(id).value;
  });
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
  Object.keys(keep).forEach(function (id) {
    if (keep[id]) $(id).value = keep[id];
  });
  /* Only default the expense date when the user has not picked one. */
  if (!$("ef-date").value) $("ef-date").value = todayISO();
}

function bindEvents() {
  document.querySelectorAll(".nav-item").forEach(function (btn) {
    btn.addEventListener("click", function () { showView(btn.getAttribute("data-view")); });
  });
  $("menuToggle").addEventListener("click", function () {
    const sidebar = document.querySelector(".sidebar");
    const open = !sidebar.classList.contains("open");
    sidebar.classList.toggle("open", open);
    $("scrim").classList.toggle("show", open);
    $("menuToggle").setAttribute("aria-expanded", String(open));
  });
  $("scrim").addEventListener("click", function () {
    document.querySelector(".sidebar").classList.remove("open");
    $("scrim").classList.remove("show");
    $("menuToggle").setAttribute("aria-expanded", "false");
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
    if (e.key === "Escape") {
      document.querySelectorAll(".modal-overlay.open").forEach(function (ov) { ov.classList.remove("open"); });
      document.querySelector(".sidebar").classList.remove("open");
      $("scrim").classList.remove("show");
      $("menuToggle").setAttribute("aria-expanded", "false");
    }
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
