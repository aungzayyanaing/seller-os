/* Seller OS — charts.js
   Hand-rolled charts with plain canvas + SVG. No libraries, no CDNs. */

const CHART_COLORS = {
  gold: "#D97706",
  goldLight: "#FBBF24",
  goldDark: "#92400E",
  slate: "#64748B",
  slateLight: "#94A3B8",
  green: "#15803D",
  red: "#B91C1C",
  grid: "#E5E7EB",
  text: "#6B7280"
};

const DONUT_PALETTE = ["#D97706", "#FBBF24", "#92400E", "#FCD34D", "#78350F", "#B45309", "#A16207"];

function setupCanvas(canvas, height) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 600;
  const h = height || 220;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.height = h + "px";
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx: ctx, w: w, h: h };
}

function fmtCompact(n) {
  if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (Math.abs(n) >= 1000) return Math.round(n / 1000) + "k";
  return String(Math.round(n));
}

/* Multi-series line chart.
   labels: string[], series: [{label, values: number[], color}] */
function drawMultiLineChart(canvas, labels, series, height) {
  const pad = { l: 52, r: 32, t: 14, b: 26 };
  const s = setupCanvas(canvas, height || 220);
  const ctx = s.ctx;
  const plotW = s.w - pad.l - pad.r;
  const plotH = s.h - pad.t - pad.b;
  if (!labels.length) return;

  let max = 0;
  let min = 0;
  series.forEach(function (sr) {
    sr.values.forEach(function (v) {
      if (v > max) max = v;
      if (v < min) min = v;
    });
  });
  if (max === 0 && min === 0) max = 1;
  const range = max - min || 1;
  max = max + range * 0.1;
  min = min - range * 0.1;

  function x(i) { return pad.l + (plotW * i) / Math.max(labels.length - 1, 1); }
  function y(v) { return pad.t + plotH - ((v - min) / (max - min)) * plotH; }

  ctx.clearRect(0, 0, s.w, s.h);
  ctx.font = "11px system-ui, sans-serif";
  ctx.fillStyle = CHART_COLORS.text;
  ctx.strokeStyle = CHART_COLORS.grid;
  ctx.lineWidth = 1;

  // Gridlines + y labels (4 steps)
  for (let g = 0; g <= 4; g++) {
    const val = min + ((max - min) * g) / 4;
    const gy = y(val);
    ctx.beginPath();
    ctx.moveTo(pad.l, gy);
    ctx.lineTo(s.w - pad.r, gy);
    ctx.stroke();
    ctx.textAlign = "right";
    ctx.fillText(fmtCompact(val), pad.l - 6, gy + 4);
  }

  // X labels (every nth so they fit). Clamp each label's centre so the
  // full text stays inside the canvas (the last label used to clip to "21 No").
  const step = Math.max(1, Math.ceil(labels.length / 7));
  ctx.textAlign = "center";
  labels.forEach(function (lb, i) {
    if (i % step === 0 || i === labels.length - 1) {
      const tw = ctx.measureText(lb).width;
      const cx = Math.max(tw / 2 + 2, Math.min(x(i), s.w - tw / 2 - 2));
      ctx.fillText(lb, cx, s.h - 8);
    }
  });

  // Series lines
  series.forEach(function (sr) {
    // Area fill under the first series only (light, solid alpha — not a gradient)
    if (sr === series[0]) {
      ctx.beginPath();
      sr.values.forEach(function (v, i) {
        if (i === 0) ctx.moveTo(x(i), y(v));
        else ctx.lineTo(x(i), y(v));
      });
      ctx.lineTo(x(sr.values.length - 1), pad.t + plotH);
      ctx.lineTo(x(0), pad.t + plotH);
      ctx.closePath();
      ctx.fillStyle = "rgba(217, 119, 6, 0.08)";
      ctx.fill();
    }
    ctx.beginPath();
    sr.values.forEach(function (v, i) {
      if (i === 0) ctx.moveTo(x(i), y(v));
      else ctx.lineTo(x(i), y(v));
    });
    ctx.strokeStyle = sr.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    sr.values.forEach(function (v, i) {
      ctx.beginPath();
      ctx.arc(x(i), y(v), 2.5, 0, Math.PI * 2);
      ctx.fillStyle = sr.color;
      ctx.fill();
    });
  });

  // Legend
  let lx = pad.l;
  ctx.textAlign = "left";
  ctx.font = "12px system-ui, sans-serif";
  series.forEach(function (sr) {
    ctx.fillStyle = sr.color;
    ctx.fillRect(lx, 0, 10, 10);
    ctx.fillStyle = "#374151";
    ctx.fillText(sr.label, lx + 14, 9);
    lx += 14 + ctx.measureText(sr.label).width + 18;
  });
}

/* Horizontal bar chart with full labels (no truncation).
   labels: string[], values: number[] */
function drawBarChart(canvas, labels, values, color, height) {
  const s = setupCanvas(canvas, height || 220);
  const ctx = s.ctx;
  if (!labels.length) return;

  let max = 0;
  values.forEach(function (v) { if (v > max) max = v; });
  if (max === 0) max = 1;

  // Left gutter sized to the longest label so full names always fit.
  ctx.font = "11px system-ui, sans-serif";
  let labelW = 0;
  labels.forEach(function (lb) {
    labelW = Math.max(labelW, ctx.measureText(lb).width);
  });
  const pad = { l: Math.ceil(labelW) + 12, r: 34, t: 12, b: 14 };
  const plotW = s.w - pad.l - pad.r;
  const plotH = s.h - pad.t - pad.b;

  ctx.clearRect(0, 0, s.w, s.h);
  ctx.fillStyle = CHART_COLORS.text;
  ctx.strokeStyle = CHART_COLORS.grid;
  ctx.lineWidth = 1;

  // Vertical gridlines + x labels (5 steps)
  for (let g = 0; g <= 4; g++) {
    const val = (max * g) / 4;
    const gx = pad.l + (plotW * g) / 4;
    ctx.beginPath();
    ctx.moveTo(gx, pad.t);
    ctx.lineTo(gx, pad.t + plotH);
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillText(fmtCompact(val), gx, s.h - 2);
  }

  const slot = plotH / labels.length;
  const barH = Math.min(26, slot * 0.55);
  labels.forEach(function (lb, i) {
    const bw = (plotW * values[i]) / max;
    const by = pad.t + slot * i + (slot - barH) / 2;
    ctx.fillStyle = color || CHART_COLORS.gold;
    ctx.fillRect(pad.l, by, bw, barH);
    ctx.fillStyle = "#374151";
    ctx.textAlign = "left";
    ctx.fillText(fmtCompact(values[i]), pad.l + bw + 6, by + barH / 2 + 4);
    ctx.fillStyle = CHART_COLORS.text;
    ctx.textAlign = "right";
    ctx.fillText(lb, pad.l - 8, by + barH / 2 + 4);
  });
}

/* Donut chart (SVG) with legend.
   segments: [{label, value, color}] — rendered into a container element. */
function drawDonut(container, segments, centerLabel) {
  const total = segments.reduce(function (sum, sg) { return sum + sg.value; }, 0);
  if (!container) return;
  if (!segments.length || total === 0) {
    container.innerHTML = '<p class="empty">' + (centerLabel || "") + "</p>";
    return;
  }
  const r = 70;
  const c = 2 * Math.PI * r;
  let offset = 0;
  let arcs = "";
  segments.forEach(function (sg) {
    const frac = sg.value / total;
    const len = frac * c;
    arcs += '<circle cx="100" cy="100" r="' + r + '" fill="none" stroke="' + sg.color +
      '" stroke-width="28" stroke-dasharray="' + Math.max(len - 2, 0) + " " + c +
      '" stroke-dashoffset="' + (-offset) + '" transform="rotate(-90 100 100)"/>';
    offset += len;
  });
  // Round percentages, then give the largest slice the rounding remainder
  // so the legend always totals exactly 100%.
  const pcts = segments.map(function (sg) { return Math.round((sg.value / total) * 100); });
  const pctSum = pcts.reduce(function (a, b) { return a + b; }, 0);
  if (pcts.length && pctSum !== 100) {
    let bi = 0;
    segments.forEach(function (sg, i) { if (sg.value > segments[bi].value) bi = i; });
    pcts[bi] += 100 - pctSum;
  }
  let legend = "";
  segments.forEach(function (sg, i) {
    const pct = pcts[i];
    legend += '<div class="legend-row"><span class="legend-dot" style="background:' + sg.color +
      '"></span><span class="legend-label">' + escapeHtml(sg.label) +
      '</span><span class="legend-value">' + pct + "%</span></div>";
  });
  container.innerHTML =
    '<div class="donut-wrap">' +
    '<svg viewBox="0 0 200 200" class="donut-svg">' + arcs +
    '<text x="100" y="96" text-anchor="middle" class="donut-center-num">' + fmtCompact(total) + "</text>" +
    '<text x="100" y="116" text-anchor="middle" class="donut-center-label">' + escapeHtml(centerLabel || "") + "</text>" +
    "</svg>" +
    '<div class="legend">' + legend + "</div>" +
    "</div>";
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
