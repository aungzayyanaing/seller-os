# Seller OS

A free, offline-first business manager for small sellers — built for Myanmar shop owners and resellers. Track products, orders, customers, expenses, and profit in one place. No account, no server, no internet needed: all data stays in your browser.

## Features

- **Dashboard** — today's revenue, this month's profit, pending orders, low-stock alerts, a 14-day revenue chart, top products, and recent orders.
- **Products** — search and filter by category, add/edit/delete, auto SKU, cost price, sell price, stock, and profit margin per product.
- **New Order** — pick an existing customer or add a new one on the spot, add product lines, stock decreases automatically on save, payment by Cash / KBZPay / WavePay / AYA Pay, status Pending / Paid / Delivered / Cancelled.
- **Orders** — filter by status, change status, view full details, cancel an order to return items to stock.
- **Customers** — total spent and order count per customer, search, add/edit/delete.
- **Expenses** — Rent, Stock purchase, Delivery, Marketing, Other; monthly total at a glance.
- **Analytics** — profit chart (revenue vs expenses vs profit, last 30 days), top-5 products, sales by category, sales by payment method.
- **Data** — export everything as JSON, export orders as CSV, import a JSON backup, reset, or clear the demo data.
- **Burmese + English** — full interface in Burmese by default, one tap to switch to English.
- **Demo data** — realistic Myanmar shop data on first run (8 products, 12 orders, 6 customers, 8 expenses) so you can try everything immediately.

## How to use

Open `index.html` directly in any modern browser, or serve the folder:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000 in your browser.

All amounts are in Myanmar kyat (Ks). All data is stored in your browser's localStorage under the key `seller-os-v1` — nothing leaves your device. Use **Data → Export All Data (JSON)** to back up before clearing browser data.

## Tech

Pure static files — zero build step, zero external dependencies, zero CDNs, zero webfonts:

- `index.html` — app shell (dark sidebar navigation + views)
- `styles.css` — light theme, dark sidebar, gold accent
- `app.js` — state, persistence, routing, CRUD, order flow
- `charts.js` — hand-rolled canvas line/bar charts and SVG donut charts
- `i18n.js` — Burmese + English strings

Fonts use the system stack only (`'Sora','Myanmar Sangam MN','Myanmar MN','Myanmar Text','Noto Sans Myanmar',system-ui,sans-serif`) so Myanmar text shapes correctly on every device.

## Screenshots

Screenshots coming soon — open `index.html` to see the app live.

## License

MIT — see [LICENSE](LICENSE).
