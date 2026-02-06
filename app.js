const API_BASE = "https://api.coinpaprika.com/v1";
const COIN_LIST_LIMIT = 1000;
const COIN_CACHE_DAYS = 7;
const PRICE_CACHE_MINUTES = 15;
const ASSET_VERSION =
  new URL(document.currentScript?.src || window.location.href).searchParams.get("v") || "dev";

const STORAGE_KEYS = {
  transactions: "cit.transactions",
  prices: "cit.prices",
  pricesUpdatedAt: "cit.prices.updatedAt",
  coins: "cit.coins",
  coinsUpdatedAt: "cit.coins.updatedAt",
  activeTab: "cit.activeTab",
};

const state = {
  transactions: [],
  prices: {},
  coins: [],
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const currencyFormatterSmall = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 6,
});

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 8,
});

const chartPalette = [
  "#0c6b63",
  "#f59e0b",
  "#2563eb",
  "#db2777",
  "#14b8a6",
  "#9333ea",
  "#0ea5e9",
  "#16a34a",
  "#f97316",
  "#dc2626",
];

const els = {
  txForm: document.getElementById("txForm"),
  txType: document.getElementById("txType"),
  txTypeButtons: Array.from(document.querySelectorAll(".toggle-group .toggle")),
  buyFields: document.getElementById("buyFields"),
  sellFields: document.getElementById("sellFields"),
  sellCoin: document.getElementById("sellCoin"),
  sellAvailable: document.getElementById("sellAvailable"),
  txSubmitBtn: document.getElementById("txSubmitBtn"),
  setNowBtn: document.getElementById("setNowBtn"),
  tabList: document.querySelector(".tablist"),
  tabButtons: Array.from(document.querySelectorAll('[role="tab"]')),
  tabPanels: Array.from(document.querySelectorAll('[role="tabpanel"]')),
  txDate: document.getElementById("txDate"),
  coinSearch: document.getElementById("coinSearch"),
  coinId: document.getElementById("coinId"),
  coinSymbol: document.getElementById("coinSymbol"),
  coinName: document.getElementById("coinName"),
  coinResults: document.getElementById("coinResults"),
  coinStatus: document.getElementById("coinStatus"),
  txQuantity: document.getElementById("txQuantity"),
  txPrice: document.getElementById("txPrice"),
  txFee: document.getElementById("txFee"),
  txNotes: document.getElementById("txNotes"),
  txTotal: document.getElementById("txTotal"),
  formMessage: document.getElementById("formMessage"),
  totalInvested: document.getElementById("totalInvested"),
  currentValue: document.getElementById("currentValue"),
  unrealizedPL: document.getElementById("unrealizedPL"),
  realizedPL: document.getElementById("realizedPL"),
  priceNote: document.getElementById("priceNote"),
  allocationNote: document.getElementById("allocationNote"),
  valueNote: document.getElementById("valueNote"),
  costValueNote: document.getElementById("costValueNote"),
  performanceNote: document.getElementById("performanceNote"),
  holdingsTable: document.getElementById("holdingsTable"),
  txTable: document.getElementById("txTable"),
  filterCoin: document.getElementById("filterCoin"),
  filterType: document.getElementById("filterType"),
  filterText: document.getElementById("filterText"),
  refreshPricesBtn: document.getElementById("refreshPricesBtn"),
  exportCsvBtn: document.getElementById("exportCsvBtn"),
  downloadBackupBtn: document.getElementById("downloadBackupBtn"),
  restoreBackupBtn: document.getElementById("restoreBackupBtn"),
  backupFileInput: document.getElementById("backupFileInput"),
  clearAllBtn: document.getElementById("clearAllBtn"),
  installPrompt: document.getElementById("installPrompt"),
  installNowBtn: document.getElementById("installNowBtn"),
  installLaterBtn: document.getElementById("installLaterBtn"),
  installSubtitle: document.getElementById("installSubtitle"),
  installHint: document.getElementById("installHint"),
};

let allocationChart = null;
let investedChart = null;
let unrealizedChart = null;
let realizedChart = null;
let holdingsChart = null;
let costValueChart = null;
let buySellChart = null;
let performanceChart = null;
let latestMetrics = null;
let deferredInstallPrompt = null;
let editingTransactionId = null;

const percentageLabelPlugin = {
  id: "percentageLabels",
  afterDatasetsDraw(chart, args, options) {
    const { ctx } = chart;
    const dataset = chart.data.datasets[0];
    if (!dataset || !dataset.data || !dataset.data.length) return;
    const total = dataset.data.reduce((sum, value) => sum + value, 0);
    if (!total) return;

    const meta = chart.getDatasetMeta(0);
    const minPercent = options?.minPercent ?? 0;
    const color = options?.color ?? "#1c1b1b";
    const font = options?.font ?? "600 12px Sora";

    ctx.save();
    ctx.fillStyle = color;
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    meta.data.forEach((arc, index) => {
      const value = dataset.data[index];
      if (!value) return;
      const percent = (value / total) * 100;
      if (percent < minPercent) return;
      const label = percent < 1 ? "<1%" : `${percent.toFixed(percent < 10 ? 1 : 0)}%`;
      const position = arc.tooltipPosition();
      ctx.fillText(label, position.x, position.y);
    });

    ctx.restore();
  },
};

function safeParse(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function formatMoney(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  const abs = Math.abs(value);
  const formatter = abs > 0 && abs < 1 ? currencyFormatterSmall : currencyFormatter;
  return formatter.format(value);
}

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return numberFormatter.format(value);
}

function formatPercent(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

function withAlpha(hex, alpha) {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return hex;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function escapeAttribute(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDatetimeLocalInputValue(value) {
  if (!value) return getLocalDatetimeValue();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return getLocalDatetimeValue();
  return getLocalDatetimeValue(date);
}

function getLocalDatetimeValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function loadState() {
  state.transactions = safeParse(localStorage.getItem(STORAGE_KEYS.transactions), []);
  state.prices = safeParse(localStorage.getItem(STORAGE_KEYS.prices), {});
  state.coins = safeParse(localStorage.getItem(STORAGE_KEYS.coins), []);
}

function saveTransactions() {
  localStorage.setItem(STORAGE_KEYS.transactions, JSON.stringify(state.transactions));
}

function savePrices() {
  localStorage.setItem(STORAGE_KEYS.prices, JSON.stringify(state.prices));
  localStorage.setItem(STORAGE_KEYS.pricesUpdatedAt, new Date().toISOString());
}

function saveCoins() {
  localStorage.setItem(STORAGE_KEYS.coins, JSON.stringify(state.coins));
  localStorage.setItem(STORAGE_KEYS.coinsUpdatedAt, new Date().toISOString());
}

function setMessage(text, isError = true) {
  els.formMessage.textContent = text;
  els.formMessage.style.color = isError ? "var(--danger)" : "var(--success)";
}

function clearMessage() {
  els.formMessage.textContent = "";
}

function updateTotalPreview() {
  const qty = parseFloat(els.txQuantity.value) || 0;
  const price = parseFloat(els.txPrice.value) || 0;
  const fee = parseFloat(els.txFee.value) || 0;
  const type = els.txType.value;
  const total = type === "sell" ? qty * price - fee : qty * price + fee;
  els.txTotal.textContent = formatMoney(total);
}

function setTxType(type) {
  const nextType = type === "sell" ? "sell" : "buy";
  els.txType.value = nextType;
  els.txTypeButtons.forEach((button) => {
    const isActive = button.dataset.type === nextType;
    button.classList.toggle("active", isActive);
    button.classList.toggle("is-disabled", !isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
  updateSellFields();
  updateTotalPreview();
}

function getSellableAssets() {
  const metrics = latestMetrics || buildPortfolio(state.transactions, state.prices);
  return metrics.assets.filter((asset) => asset.holdings > 0);
}

function applySellSelection(assets) {
  if (!els.sellCoin) return;
  const selectedKey = els.sellCoin.value;
  const selected = assets.find((asset) => asset.key === selectedKey) || assets[0];

  if (!selected) return;

  els.coinId.value = selected.coinId || "";
  els.coinSymbol.value = selected.symbol;
  els.coinName.value = selected.name || selected.symbol;

  const maxQty = selected.holdings;
  els.txQuantity.max = maxQty;
  if (els.sellAvailable) {
    els.sellAvailable.textContent = `Available: ${formatNumber(maxQty)} ${selected.symbol}`;
  }
  const currentQty = parseFloat(els.txQuantity.value);
  if (currentQty > maxQty) {
    els.txQuantity.value = maxQty;
  }
}

function updateSellFields() {
  if (!els.sellFields || !els.buyFields || !els.txQuantity) return;
  const isSell = els.txType.value === "sell";
  els.buyFields.hidden = isSell;
  els.sellFields.hidden = !isSell;
  els.buyFields.style.display = isSell ? "none" : "block";
  els.sellFields.style.display = isSell ? "flex" : "none";

  if (!isSell) {
    els.txQuantity.removeAttribute("max");
    els.txQuantity.disabled = false;
    if (els.txSubmitBtn) els.txSubmitBtn.disabled = false;
    if (els.sellAvailable) els.sellAvailable.textContent = "";
    return;
  }

  const assets = getSellableAssets();
  if (!assets.length) {
    els.sellCoin.innerHTML = '<option value="">No holdings to sell</option>';
    els.sellCoin.disabled = true;
    els.txQuantity.value = "";
    els.txQuantity.disabled = true;
    if (els.txSubmitBtn) els.txSubmitBtn.disabled = true;
    if (els.sellAvailable) {
      els.sellAvailable.textContent = "No holdings available to sell yet.";
    }
    return;
  }

  els.sellCoin.disabled = false;
  els.txQuantity.disabled = false;
  if (els.txSubmitBtn) els.txSubmitBtn.disabled = false;

  const currentValue = els.sellCoin.value;
  const options = assets
    .map((asset) => {
      const label = `${asset.symbol}${asset.name ? ` • ${asset.name}` : ""}`;
      return `<option value="${asset.key}">${label}</option>`;
    })
    .join("");
  els.sellCoin.innerHTML = options;

  const hasCurrent = assets.some((asset) => asset.key === currentValue);
  els.sellCoin.value = hasCurrent ? currentValue : assets[0].key;
  applySellSelection(assets);
}

function isPortfolioTabActive() {
  const portfolioTab = document.getElementById("tab-portfolio");
  if (!portfolioTab) return true;
  return portfolioTab.classList.contains("active");
}

function setActiveTab(targetId, { focus = false, renderCharts = false } = {}) {
  const buttons = els.tabButtons;
  if (!buttons.length) return;
  const nextButton = buttons.find((button) => button.id === targetId) || buttons[0];

  buttons.forEach((button) => {
    const isActive = button === nextButton;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
    button.tabIndex = isActive ? 0 : -1;
    const panelId = button.getAttribute("aria-controls");
    const panel = panelId ? document.getElementById(panelId) : null;
    if (panel) {
      panel.hidden = !isActive;
    }
  });

  localStorage.setItem(STORAGE_KEYS.activeTab, nextButton.id);
  if (focus) {
    nextButton.focus();
  }
  if (renderCharts && nextButton.id === "tab-portfolio") {
    requestAnimationFrame(() => {
      render();
    });
  }
}

function handleTabKeydown(event) {
  const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
  if (!keys.includes(event.key)) return;
  event.preventDefault();

  const buttons = els.tabButtons;
  if (!buttons.length) return;
  const currentIndex = buttons.findIndex((button) => button.classList.contains("active"));
  let nextIndex = currentIndex;

  if (event.key === "ArrowRight") {
    nextIndex = (currentIndex + 1) % buttons.length;
  }
  if (event.key === "ArrowLeft") {
    nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
  }
  if (event.key === "Home") {
    nextIndex = 0;
  }
  if (event.key === "End") {
    nextIndex = buttons.length - 1;
  }

  const nextButton = buttons[nextIndex];
  if (nextButton) {
    setActiveTab(nextButton.id, { focus: true, renderCharts: true });
  }
}

function ensureCoinSearchList() {
  const lastUpdated = localStorage.getItem(STORAGE_KEYS.coinsUpdatedAt);
  if (state.coins.length > 0 && lastUpdated) {
    const ageMs = Date.now() - new Date(lastUpdated).getTime();
    if (ageMs < COIN_CACHE_DAYS * 24 * 60 * 60 * 1000) {
      els.coinStatus.textContent = `Coin list updated ${new Date(lastUpdated).toLocaleDateString()}.`;
      return;
    }
  }
  fetchCoinList();
}

async function fetchCoinList() {
  els.coinStatus.textContent = "Fetching coin list...";
  try {
    const response = await fetch(`${API_BASE}/coins`);
    if (!response.ok) throw new Error("Failed to fetch coin list");
    const data = await response.json();
    const active = data
      .filter((coin) => coin.is_active && coin.rank && coin.rank > 0)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, COIN_LIST_LIMIT)
      .map((coin) => ({
        id: coin.id,
        name: coin.name,
        symbol: coin.symbol,
        rank: coin.rank,
      }));
    state.coins = active;
    saveCoins();
    els.coinStatus.textContent = `Loaded top ${active.length} coins for quick search.`;
  } catch (error) {
    els.coinStatus.textContent = "Could not load coin list. You can still enter a coin ID manually.";
  }
}

function renderCoinResults(results) {
  if (!results.length) {
    els.coinResults.innerHTML = "";
    return;
  }
  els.coinResults.innerHTML = results
    .map(
      (coin) => `
        <button type="button" class="coin-result" data-id="${coin.id}" data-symbol="${coin.symbol}" data-name="${coin.name}">
          <strong>${coin.symbol}</strong> ${coin.name} <span class="note">${coin.id}</span>
        </button>
      `,
    )
    .join("");
}

function handleCoinSearch() {
  const term = els.coinSearch.value.trim().toLowerCase();
  if (term.length < 2) {
    renderCoinResults([]);
    return;
  }
  const matches = state.coins
    .filter((coin) =>
      coin.name.toLowerCase().includes(term) || coin.symbol.toLowerCase().includes(term),
    )
    .slice(0, 6);
  renderCoinResults(matches);
}

function selectCoinFromResults(target) {
  const button = target.closest(".coin-result");
  if (!button) return;
  els.coinId.value = button.dataset.id || "";
  els.coinSymbol.value = (button.dataset.symbol || "").toUpperCase();
  els.coinName.value = button.dataset.name || "";
  els.coinSearch.value = `${button.dataset.symbol} - ${button.dataset.name}`;
  renderCoinResults([]);
}

function validateTransaction(transaction, { excludeId } = {}) {
  if (!transaction.symbol) {
    return "Symbol is required.";
  }
  if (!transaction.quantity || transaction.quantity <= 0) {
    return "Quantity must be greater than zero.";
  }
  if (!transaction.price || transaction.price <= 0) {
    return "Price must be greater than zero.";
  }
  const baseTransactions = excludeId
    ? state.transactions.filter((tx) => tx.id !== excludeId)
    : state.transactions;
  const testTransactions = [...baseTransactions, transaction].sort(
    (a, b) => new Date(a.date) - new Date(b.date),
  );
  const holdings = {};
  for (const tx of testTransactions) {
    const key = tx.coinId || tx.symbol.toUpperCase();
    holdings[key] = holdings[key] || 0;
    if (tx.type === "buy") {
      holdings[key] += tx.quantity;
    } else {
      holdings[key] -= tx.quantity;
      if (holdings[key] < -1e-8) {
        return `Sell exceeds holdings for ${tx.symbol}.`;
      }
    }
  }
  return "";
}

function addTransaction(event) {
  event.preventDefault();
  clearMessage();
  const currentType = els.txType.value;
  const transaction = {
    id: `tx_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    type: currentType,
    date: els.txDate.value || getLocalDatetimeValue(),
    coinId: els.coinId.value.trim(),
    symbol: els.coinSymbol.value.trim().toUpperCase(),
    name: els.coinName.value.trim(),
    quantity: parseFloat(els.txQuantity.value),
    price: parseFloat(els.txPrice.value),
    fee: parseFloat(els.txFee.value) || 0,
    notes: els.txNotes.value.trim(),
  };

  const error = validateTransaction(transaction);
  if (error) {
    setMessage(error, true);
    return;
  }

  state.transactions.push(transaction);
  saveTransactions();
  els.txForm.reset();
  els.txDate.value = getLocalDatetimeValue();
  setTxType(currentType);
  updateTotalPreview();
  setMessage("Transaction added.", false);
  render();
}

function buildInlineEditTotalClass(total) {
  if (total > 0) return "positive";
  if (total < 0) return "negative";
  return "";
}

function updateInlineEditRowTotal(row) {
  if (!row) return;
  const typeInput = row.querySelector('[data-field="type"]');
  const quantityInput = row.querySelector('[data-field="quantity"]');
  const priceInput = row.querySelector('[data-field="price"]');
  const feeInput = row.querySelector('[data-field="fee"]');
  const totalCell = row.querySelector("[data-inline-total]");
  if (!typeInput || !quantityInput || !priceInput || !feeInput || !totalCell) return;

  const type = typeInput.value === "sell" ? "sell" : "buy";
  const quantity = parseFloat(quantityInput.value) || 0;
  const price = parseFloat(priceInput.value) || 0;
  const fee = parseFloat(feeInput.value) || 0;
  const total = type === "sell" ? quantity * price - fee : -(quantity * price + fee);

  totalCell.textContent = formatMoney(total);
  totalCell.classList.remove("positive", "negative");
  const totalClass = buildInlineEditTotalClass(total);
  if (totalClass) {
    totalCell.classList.add(totalClass);
  }
}

function startInlineEdit(id) {
  const tx = state.transactions.find((entry) => entry.id === id);
  if (!tx) return;
  editingTransactionId = id;
  clearMessage();
  renderTransactions();
}

function cancelInlineEdit() {
  if (!editingTransactionId) return;
  editingTransactionId = null;
  clearMessage();
  renderTransactions();
}

function saveInlineEdit(id, row) {
  const existing = state.transactions.find((entry) => entry.id === id);
  if (!existing || !row) return;

  const dateInput = row.querySelector('[data-field="date"]');
  const typeInput = row.querySelector('[data-field="type"]');
  const quantityInput = row.querySelector('[data-field="quantity"]');
  const priceInput = row.querySelector('[data-field="price"]');
  const feeInput = row.querySelector('[data-field="fee"]');
  const notesInput = row.querySelector('[data-field="notes"]');

  const updatedTransaction = {
    ...existing,
    date: dateInput?.value || existing.date,
    type: typeInput?.value === "sell" ? "sell" : "buy",
    quantity: parseFloat(quantityInput?.value || ""),
    price: parseFloat(priceInput?.value || ""),
    fee: parseFloat(feeInput?.value || "") || 0,
    notes: (notesInput?.value || "").trim(),
  };

  const error = validateTransaction(updatedTransaction, { excludeId: id });
  if (error) {
    setMessage(error, true);
    return;
  }

  state.transactions = state.transactions.map((entry) => (entry.id === id ? updatedTransaction : entry));
  saveTransactions();
  editingTransactionId = null;
  setMessage("Transaction updated.", false);
  render();
}

function buildPortfolio(transactions, prices) {
  const assets = new Map();
  const sorted = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
  let cumulativeInvested = 0;
  let cumulativeRealized = 0;
  let cumulativeCostBasis = 0;
  let totalValueAtTrade = 0;
  const timeline = [];

  for (const tx of sorted) {
    const key = tx.coinId || tx.symbol.toUpperCase();
    const asset = assets.get(key) || {
      key,
      coinId: tx.coinId || "",
      symbol: tx.symbol.toUpperCase(),
      name: tx.name || tx.symbol.toUpperCase(),
      holdings: 0,
      costBasis: 0,
      realizedPnl: 0,
      lastPrice: null,
      totalBuyQty: 0,
      totalSellQty: 0,
      totalBuyCost: 0,
      totalSellProceeds: 0,
    };

    const quantity = tx.quantity;
    const price = tx.price;
    const fee = tx.fee || 0;
    const total = quantity * price;
    const prevHoldings = asset.holdings;
    const prevLastPrice = asset.lastPrice;
    const prevContribution = prevLastPrice !== null ? prevHoldings * prevLastPrice : 0;

    if (tx.type === "buy") {
      asset.holdings += quantity;
      asset.costBasis += total + fee;
      asset.totalBuyQty += quantity;
      asset.totalBuyCost += total + fee;
      cumulativeInvested += total + fee;
      cumulativeCostBasis += total + fee;
    } else {
      const avgCost = asset.holdings > 0 ? asset.costBasis / asset.holdings : 0;
      const costOfSold = avgCost * quantity;
      const proceeds = total - fee;
      asset.holdings -= quantity;
      asset.costBasis -= costOfSold;
      asset.totalSellQty += quantity;
      asset.totalSellProceeds += proceeds;
      asset.realizedPnl += proceeds - costOfSold;
      cumulativeInvested -= proceeds;
      cumulativeRealized += proceeds - costOfSold;
      cumulativeCostBasis -= costOfSold;
    }

    asset.lastPrice = price;
    const newContribution = asset.lastPrice !== null ? asset.holdings * asset.lastPrice : 0;
    totalValueAtTrade += newContribution - prevContribution;

    assets.set(key, asset);
    const holdingsSnapshot = {};
    assets.forEach((entry, assetKey) => {
      if (entry.holdings > 0) {
        holdingsSnapshot[assetKey] = entry.holdings;
      }
    });
    timeline.push({
      date: tx.date,
      invested: cumulativeInvested,
      valueAtTrade: totalValueAtTrade,
      costBasis: cumulativeCostBasis,
      realized: cumulativeRealized,
      holdings: holdingsSnapshot,
    });
  }

  let totalInvested = 0;
  let totalValue = 0;
  let totalCostBasis = 0;
  let totalRealized = 0;
  let missingPrices = 0;
  let allocationEstimatedCount = 0;

  const assetList = Array.from(assets.values()).map((asset) => {
    const priceEntry = asset.coinId ? prices[asset.coinId] : null;
    const currentPrice = priceEntry ? priceEntry.price : null;
    const currentValue = currentPrice !== null ? asset.holdings * currentPrice : null;
    const unrealized = currentPrice !== null ? currentValue - asset.costBasis : null;
    const allocationValue =
      currentValue !== null ? currentValue : asset.holdings > 0 ? asset.costBasis : 0;
    const usesEstimate = currentValue === null && asset.holdings > 0;

    totalInvested += asset.totalBuyCost - asset.totalSellProceeds;
    totalRealized += asset.realizedPnl;
    totalCostBasis += asset.costBasis;
    if (currentValue !== null) {
      totalValue += currentValue;
    } else if (asset.holdings > 0) {
      missingPrices += 1;
    }
    if (usesEstimate) {
      allocationEstimatedCount += 1;
    }

    return {
      ...asset,
      avgCost: asset.holdings > 0 ? asset.costBasis / asset.holdings : null,
      currentPrice,
      currentValue,
      unrealized,
      allocationValue,
      usesEstimate,
    };
  });

  const totalUnrealized = totalValue - totalCostBasis;

  return {
    assets: assetList.sort(
      (a, b) => (b.currentValue ?? 0) - (a.currentValue ?? 0),
    ),
    totals: {
      invested: totalInvested,
      currentValue: totalValue,
      unrealized: totalUnrealized,
      realized: totalRealized,
    },
    timeline,
    missingPrices,
    allocationEstimatedCount,
  };
}

function setMetric(el, value) {
  el.textContent = formatMoney(value);
  el.classList.remove("positive", "negative");
  if (value > 0) el.classList.add("positive");
  if (value < 0) el.classList.add("negative");
}

function renderSummary(metrics) {
  setMetric(els.totalInvested, metrics.totals.invested);
  setMetric(els.currentValue, metrics.totals.currentValue);
  setMetric(els.unrealizedPL, metrics.totals.unrealized);
  setMetric(els.realizedPL, metrics.totals.realized);

  const lastUpdated = localStorage.getItem(STORAGE_KEYS.pricesUpdatedAt);
  const updatedNote = lastUpdated
    ? `Live prices updated ${new Date(lastUpdated).toLocaleString()} (CoinPaprika).`
    : "Live prices not loaded yet (CoinPaprika).";
  const missingNote =
    metrics.missingPrices > 0
      ? ` Missing prices for ${metrics.missingPrices} asset(s). Add CoinPaprika IDs to enable live pricing.`
      : "";
  els.priceNote.textContent = `${updatedNote}${missingNote}`;

  if (els.allocationNote) {
    els.allocationNote.textContent =
      metrics.allocationEstimatedCount > 0
        ? `Allocation uses cost basis for ${metrics.allocationEstimatedCount} asset(s) without live prices.`
        : "";
  }

  const estimateNote =
    metrics.missingPrices > 0
      ? `Using last trade price for ${metrics.missingPrices} asset(s) without live prices.`
      : "";

  if (els.valueNote) {
    els.valueNote.textContent = estimateNote;
  }
  if (els.costValueNote) {
    els.costValueNote.textContent = estimateNote;
  }
  if (els.performanceNote) {
    els.performanceNote.textContent = estimateNote;
  }
}

function renderHoldingsTable(metrics) {
  const tbody = els.holdingsTable.querySelector("tbody");
  tbody.innerHTML = "";
  if (!metrics.assets.length) {
    tbody.innerHTML = `<tr><td colspan="8">No holdings yet. Add your first transaction.</td></tr>`;
    return;
  }

  for (const asset of metrics.assets) {
    const row = document.createElement("tr");
    const unrealizedClass = asset.unrealized > 0 ? "positive" : asset.unrealized < 0 ? "negative" : "";
    const realizedClass = asset.realizedPnl > 0 ? "positive" : asset.realizedPnl < 0 ? "negative" : "";

    row.innerHTML = `
      <td>
        <div class="coin-cell">
          <strong>${asset.symbol}</strong>
          <span class="note">${asset.name}</span>
        </div>
      </td>
      <td>${formatNumber(asset.holdings)}</td>
      <td>${asset.avgCost !== null ? formatMoney(asset.avgCost) : "—"}</td>
      <td>${formatMoney(asset.costBasis)}</td>
      <td>${asset.currentPrice !== null ? formatMoney(asset.currentPrice) : "—"}</td>
      <td>${asset.currentValue !== null ? formatMoney(asset.currentValue) : "—"}</td>
      <td class="${unrealizedClass}">${asset.unrealized !== null ? formatMoney(asset.unrealized) : "—"}</td>
      <td class="${realizedClass}">${formatMoney(asset.realizedPnl)}</td>
    `;
    tbody.appendChild(row);
  }
}

function renderTransactions() {
  const tbody = els.txTable.querySelector("tbody");
  if (editingTransactionId && !state.transactions.some((tx) => tx.id === editingTransactionId)) {
    editingTransactionId = null;
  }
  const filterCoin = els.filterCoin ? els.filterCoin.value : "all";
  const filterType = els.filterType.value;
  const filterText = els.filterText.value.trim().toLowerCase();

  let filtered = [...state.transactions];
  if (filterCoin !== "all") {
    filtered = filtered.filter((tx) => {
      const key = tx.coinId || tx.symbol.toUpperCase();
      return key === filterCoin;
    });
  }
  if (filterType !== "all") {
    filtered = filtered.filter((tx) => tx.type === filterType);
  }
  if (filterText) {
    filtered = filtered.filter((tx) => {
      const haystack = `${tx.symbol} ${tx.name} ${tx.notes}`.toLowerCase();
      return haystack.includes(filterText);
    });
  }

  filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

  tbody.innerHTML = "";
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="9">No transactions found.</td></tr>`;
    return;
  }

  for (const tx of filtered) {
    const row = document.createElement("tr");
    if (tx.id === editingTransactionId) {
      const total = tx.type === "sell" ? tx.quantity * tx.price - tx.fee : -(tx.quantity * tx.price + tx.fee);
      const totalClass = buildInlineEditTotalClass(total);
      const notesValue = escapeAttribute(tx.notes || "");
      row.classList.add("row-editing");
      row.dataset.id = tx.id;
      row.innerHTML = `
        <td>
          <input type="datetime-local" class="inline-input inline-date" data-field="date" value="${toDatetimeLocalInputValue(tx.date)}" />
        </td>
        <td>
          <select class="inline-input inline-select" data-field="type">
            <option value="buy"${tx.type === "buy" ? " selected" : ""}>buy</option>
            <option value="sell"${tx.type === "sell" ? " selected" : ""}>sell</option>
          </select>
        </td>
        <td>${tx.symbol}${tx.name ? ` • ${tx.name}` : ""}</td>
        <td><input type="number" class="inline-input inline-number" data-field="quantity" step="any" min="0" value="${tx.quantity}" /></td>
        <td><input type="number" class="inline-input inline-number" data-field="price" step="any" min="0" value="${tx.price}" /></td>
        <td><input type="number" class="inline-input inline-number" data-field="fee" step="any" min="0" value="${tx.fee}" /></td>
        <td data-inline-total class="${totalClass}">${formatMoney(total)}</td>
        <td><input type="text" class="inline-input inline-note" data-field="notes" value="${notesValue}" maxlength="200" /></td>
        <td>
          <div class="tx-actions">
            <button type="button" class="ghost" data-action="save" data-id="${tx.id}">Save</button>
            <button type="button" class="ghost" data-action="cancel" data-id="${tx.id}">Cancel</button>
          </div>
        </td>
      `;
    } else {
      const total = tx.type === "sell" ? tx.quantity * tx.price - tx.fee : -(tx.quantity * tx.price + tx.fee);
      row.innerHTML = `
        <td>${formatDate(tx.date)}</td>
        <td><span class="badge ${tx.type}">${tx.type}</span></td>
        <td>${tx.symbol}${tx.name ? ` • ${tx.name}` : ""}</td>
        <td>${formatNumber(tx.quantity)}</td>
        <td>${formatMoney(tx.price)}</td>
        <td>${formatMoney(tx.fee)}</td>
        <td class="${total >= 0 ? "positive" : "negative"}">${formatMoney(total)}</td>
        <td>${tx.notes || ""}</td>
        <td>
          <div class="tx-actions">
            <button type="button" class="ghost icon-button" data-action="edit" data-id="${tx.id}" aria-label="Edit transaction" title="Edit transaction"><span class="material-symbols-outlined" aria-hidden="true">edit</span></button>
            <button type="button" class="ghost danger icon-button" data-action="delete" data-id="${tx.id}" aria-label="Delete transaction" title="Delete transaction"><span class="material-symbols-outlined" aria-hidden="true">delete</span></button>
          </div>
        </td>
      `;
    }
    tbody.appendChild(row);
  }
}

function updateCoinFilterOptions() {
  if (!els.filterCoin) return;
  const currentValue = els.filterCoin.value;
  const coins = new Map();

  state.transactions.forEach((tx) => {
    const key = tx.coinId || tx.symbol.toUpperCase();
    const label = `${tx.symbol}${tx.name ? ` • ${tx.name}` : ""}`;
    if (!coins.has(key)) {
      coins.set(key, label);
    }
  });

  const entries = Array.from(coins.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  els.filterCoin.innerHTML = '<option value="all">All coins</option>';
  entries.forEach(([key, label]) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = label;
    els.filterCoin.appendChild(option);
  });

  if (currentValue && coins.has(currentValue)) {
    els.filterCoin.value = currentValue;
  } else {
    els.filterCoin.value = "all";
  }
}

function buildMonthlyVolume(transactions) {
  const byMonth = new Map();
  transactions.forEach((tx) => {
    const date = new Date(tx.date);
    if (Number.isNaN(date.getTime())) return;
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const label = date.toLocaleString("en-US", { month: "short", year: "numeric" });
    const entry = byMonth.get(monthKey) || { label, buy: 0, sell: 0 };
    const amount = tx.quantity * tx.price;
    const fee = tx.fee || 0;

    if (tx.type === "buy") {
      entry.buy += amount + fee;
    } else {
      entry.sell += amount - fee;
    }

    byMonth.set(monthKey, entry);
  });

  const entries = Array.from(byMonth.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, value]) => value);

  return {
    labels: entries.map((entry) => entry.label),
    buys: entries.map((entry) => entry.buy),
    sells: entries.map((entry) => entry.sell),
  };
}

function renderCharts(metrics) {
  if (typeof Chart === "undefined") return;

  const allocationData = metrics.assets.filter((asset) => asset.allocationValue > 0);
  const allocLabels = allocationData.map((asset) => asset.symbol);
  const allocValues = allocationData.map((asset) => asset.allocationValue);
  const allocColors = allocLabels.map((_, i) => chartPalette[i % chartPalette.length]);

  if (allocationChart) {
    allocationChart.data.labels = allocLabels;
    allocationChart.data.datasets[0].data = allocValues;
    allocationChart.data.datasets[0].backgroundColor = allocColors;
    allocationChart.update();
  } else {
    allocationChart = new Chart(document.getElementById("allocationChart"), {
      type: "doughnut",
      data: {
        labels: allocLabels,
        datasets: [
          {
            data: allocValues,
            backgroundColor: allocColors,
            borderWidth: 0,
          },
        ],
      },
      options: {
        plugins: {
          legend: { position: "bottom" },
          percentageLabels: {
            minPercent: 0,
            color: "#1c1b1b",
            font: "600 12px Sora",
          },
        },
        cutout: "60%",
      },
      plugins: [percentageLabelPlugin],
    });
  }

  const timeline = metrics.timeline || [];
  const timeLabels = timeline.map((point) => formatDate(point.date));
  const investedValues = timeline.map((point) => point.invested);
  const valueValues = timeline.map((point) => point.valueAtTrade);
  const unrealizedValues = timeline.map((point) => point.valueAtTrade - point.costBasis);
  const realizedValues = timeline.map((point) => point.realized);

  if (investedChart) {
    investedChart.data.labels = timeLabels;
    investedChart.data.datasets[0].data = valueValues;
    investedChart.data.datasets[1].data = investedValues;
    investedChart.update();
  } else {
    investedChart = new Chart(document.getElementById("investedChart"), {
      type: "line",
      data: {
        labels: timeLabels,
        datasets: [
          {
            label: "Portfolio value",
            data: valueValues,
            borderColor: "#2563eb",
            backgroundColor: "rgba(37, 99, 235, 0.18)",
            fill: true,
            tension: 0.3,
          },
          {
            label: "Net invested",
            data: investedValues,
            borderColor: "#0c6b63",
            backgroundColor: "rgba(12, 107, 99, 0.1)",
            fill: false,
            tension: 0.3,
          },
        ],
      },
      options: {
        plugins: {
          legend: { position: "bottom" },
        },
        scales: {
          y: {
            ticks: {
              callback: (value) => formatMoney(value),
            },
          },
        },
      },
    });
  }

  if (unrealizedChart) {
    unrealizedChart.data.labels = timeLabels;
    unrealizedChart.data.datasets[0].data = unrealizedValues;
    unrealizedChart.update();
  } else {
    unrealizedChart = new Chart(document.getElementById("unrealizedChart"), {
      type: "line",
      data: {
        labels: timeLabels,
        datasets: [
          {
            label: "Unrealized P/L",
            data: unrealizedValues,
            borderColor: "#0c6b63",
            backgroundColor: "rgba(12, 107, 99, 0.18)",
            fill: true,
            tension: 0.3,
          },
        ],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          y: {
            ticks: { callback: (value) => formatMoney(value) },
          },
        },
      },
    });
  }

  if (realizedChart) {
    realizedChart.data.labels = timeLabels;
    realizedChart.data.datasets[0].data = realizedValues;
    realizedChart.update();
  } else {
    realizedChart = new Chart(document.getElementById("realizedChart"), {
      type: "line",
      data: {
        labels: timeLabels,
        datasets: [
          {
            label: "Realized P/L",
            data: realizedValues,
            borderColor: "#f59e0b",
            backgroundColor: "rgba(245, 158, 11, 0.18)",
            fill: true,
            tension: 0.3,
          },
        ],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          y: {
            ticks: { callback: (value) => formatMoney(value) },
          },
        },
      },
    });
  }

  const assetMap = new Map(metrics.assets.map((asset) => [asset.key, asset]));
  const holdingsKeys = metrics.assets.map((asset) => asset.key);
  const holdingsDatasets = holdingsKeys.map((key, index) => {
    const asset = assetMap.get(key);
    const label = asset ? asset.symbol : key;
    const data = timeline.map((point) => point.holdings?.[key] ?? 0);
    const color = chartPalette[index % chartPalette.length];
    return {
      label,
      data,
      borderColor: color,
      backgroundColor: withAlpha(color, 0.22),
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      stack: "holdings",
    };
  });

  if (holdingsChart) {
    holdingsChart.data.labels = timeLabels;
    holdingsChart.data.datasets = holdingsDatasets;
    holdingsChart.update();
  } else {
    holdingsChart = new Chart(document.getElementById("holdingsChart"), {
      type: "line",
      data: {
        labels: timeLabels,
        datasets: holdingsDatasets,
      },
      options: {
        plugins: { legend: { position: "bottom" } },
        scales: {
          x: { stacked: false },
          y: {
            stacked: true,
            ticks: { callback: (value) => formatNumber(value) },
          },
        },
      },
    });
  }

  const costLabels = metrics.assets.map((asset) => asset.symbol);
  const costValues = metrics.assets.map((asset) => asset.costBasis);
  const currentValues = metrics.assets.map((asset) => asset.currentValue ?? asset.costBasis);

  if (costValueChart) {
    costValueChart.data.labels = costLabels;
    costValueChart.data.datasets[0].data = costValues;
    costValueChart.data.datasets[1].data = currentValues;
    costValueChart.update();
  } else {
    costValueChart = new Chart(document.getElementById("costValueChart"), {
      type: "bar",
      data: {
        labels: costLabels,
        datasets: [
          {
            label: "Cost basis",
            data: costValues,
            backgroundColor: "rgba(148, 163, 184, 0.65)",
            borderRadius: 6,
          },
          {
            label: "Current value",
            data: currentValues,
            backgroundColor: "rgba(12, 107, 99, 0.75)",
            borderRadius: 6,
          },
        ],
      },
      options: {
        indexAxis: "y",
        plugins: { legend: { position: "bottom" } },
        scales: {
          x: {
            ticks: { callback: (value) => formatMoney(value) },
          },
        },
      },
    });
  }

  const monthlyVolume = buildMonthlyVolume(state.transactions);
  if (buySellChart) {
    buySellChart.data.labels = monthlyVolume.labels;
    buySellChart.data.datasets[0].data = monthlyVolume.buys;
    buySellChart.data.datasets[1].data = monthlyVolume.sells;
    buySellChart.update();
  } else {
    buySellChart = new Chart(document.getElementById("buySellChart"), {
      type: "bar",
      data: {
        labels: monthlyVolume.labels,
        datasets: [
          {
            label: "Buys",
            data: monthlyVolume.buys,
            backgroundColor: "rgba(22, 101, 52, 0.75)",
            borderRadius: 6,
          },
          {
            label: "Sells",
            data: monthlyVolume.sells,
            backgroundColor: "rgba(159, 18, 57, 0.75)",
            borderRadius: 6,
          },
        ],
      },
      options: {
        plugins: { legend: { position: "bottom" } },
        scales: {
          x: { stacked: true },
          y: {
            stacked: true,
            ticks: { callback: (value) => formatMoney(value) },
          },
        },
      },
    });
  }

  const performanceAssets = metrics.assets.filter((asset) => asset.totalBuyCost > 0);
  const performanceLabels = performanceAssets.map((asset) => asset.symbol);
  const performanceValues = performanceAssets.map((asset) => {
    const currentValue = asset.currentValue ?? asset.costBasis;
    const totalReturn = currentValue + asset.realizedPnl;
    return ((totalReturn - asset.totalBuyCost) / asset.totalBuyCost) * 100;
  });
  const performanceColors = performanceValues.map((value) =>
    value >= 0 ? "rgba(22, 101, 52, 0.75)" : "rgba(159, 18, 57, 0.75)",
  );

  if (performanceChart) {
    performanceChart.data.labels = performanceLabels;
    performanceChart.data.datasets[0].data = performanceValues;
    performanceChart.data.datasets[0].backgroundColor = performanceColors;
    performanceChart.update();
  } else {
    performanceChart = new Chart(document.getElementById("performanceChart"), {
      type: "bar",
      data: {
        labels: performanceLabels,
        datasets: [
          {
            label: "ROI %",
            data: performanceValues,
            backgroundColor: performanceColors,
            borderRadius: 6,
          },
        ],
      },
      options: {
        indexAxis: "y",
        plugins: { legend: { display: false } },
        scales: {
          x: {
            ticks: { callback: (value) => formatPercent(value, 0) },
          },
        },
      },
    });
  }
}

function render() {
  const metrics = buildPortfolio(state.transactions, state.prices);
  latestMetrics = metrics;
  renderSummary(metrics);
  renderHoldingsTable(metrics);
  updateCoinFilterOptions();
  renderTransactions();
  updateSellFields();
  if (isPortfolioTabActive()) {
    renderCharts(metrics);
  }
}

async function refreshPrices({ silent = false } = {}) {
  const ids = Array.from(
    new Set(state.transactions.map((tx) => tx.coinId).filter((id) => id && id.length > 0)),
  );
  if (!ids.length) {
    if (!silent) {
      els.priceNote.textContent = "Add a CoinPaprika ID to enable live prices.";
    }
    return;
  }

  const originalText = els.refreshPricesBtn.textContent;
  els.refreshPricesBtn.textContent = "Refreshing...";
  els.refreshPricesBtn.disabled = true;

  const updatedPrices = { ...state.prices };
  for (const id of ids) {
    try {
      const response = await fetch(`${API_BASE}/tickers/${id}`);
      if (!response.ok) throw new Error("Failed to fetch price");
      const data = await response.json();
      const price = data?.quotes?.USD?.price;
      if (price !== undefined) {
        updatedPrices[id] = {
          price,
          updatedAt: data.last_updated,
        };
      }
    } catch (error) {
      // Ignore individual fetch failures
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  state.prices = updatedPrices;
  savePrices();
  els.refreshPricesBtn.textContent = originalText;
  els.refreshPricesBtn.disabled = false;
  render();
}

function shouldRefreshPrices() {
  const lastUpdated = localStorage.getItem(STORAGE_KEYS.pricesUpdatedAt);
  if (!lastUpdated) return true;
  const ageMs = Date.now() - new Date(lastUpdated).getTime();
  return ageMs > PRICE_CACHE_MINUTES * 60 * 1000;
}

function exportCsv() {
  if (!state.transactions.length) {
    setMessage("No transactions to export.", true);
    return;
  }

  const headers = [
    "id",
    "type",
    "date",
    "coinId",
    "symbol",
    "name",
    "quantity",
    "price",
    "fee",
    "notes",
  ];

  const rows = state.transactions.map((tx) =>
    headers.map((key) => `"${String(tx[key] ?? "").replace(/"/g, '""')}"`).join(","),
  );

  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "crypto-transactions.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  setMessage("CSV exported.", false);
}

function buildBackupPayload() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      transactions: state.transactions,
      prices: state.prices,
      pricesUpdatedAt: localStorage.getItem(STORAGE_KEYS.pricesUpdatedAt),
      coins: state.coins,
      coinsUpdatedAt: localStorage.getItem(STORAGE_KEYS.coinsUpdatedAt),
    },
  };
}

function downloadBackup() {
  const payload = buildBackupPayload();
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `crypto-tracker-backup-${date}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  setMessage("Backup downloaded.", false);
}

function applyBackupData(rawData) {
  const data = rawData?.data ?? rawData ?? {};
  const transactions = Array.isArray(data.transactions) ? data.transactions : [];
  const prices = data.prices && typeof data.prices === "object" ? data.prices : {};
  const coins = Array.isArray(data.coins) ? data.coins : [];
  const pricesUpdatedAt = data.pricesUpdatedAt || null;
  const coinsUpdatedAt = data.coinsUpdatedAt || null;

  state.transactions = transactions;
  state.prices = prices;
  state.coins = coins;

  localStorage.setItem(STORAGE_KEYS.transactions, JSON.stringify(transactions));
  localStorage.setItem(STORAGE_KEYS.prices, JSON.stringify(prices));
  localStorage.setItem(STORAGE_KEYS.coins, JSON.stringify(coins));

  if (pricesUpdatedAt) {
    localStorage.setItem(STORAGE_KEYS.pricesUpdatedAt, pricesUpdatedAt);
  } else {
    localStorage.removeItem(STORAGE_KEYS.pricesUpdatedAt);
  }

  if (coinsUpdatedAt) {
    localStorage.setItem(STORAGE_KEYS.coinsUpdatedAt, coinsUpdatedAt);
  } else {
    localStorage.removeItem(STORAGE_KEYS.coinsUpdatedAt);
  }
}

function restoreBackup(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const confirmed = window.confirm(
        "Restore backup? This will overwrite your current data.",
      );
      if (!confirmed) return;
      applyBackupData(parsed);
      render();
      ensureCoinSearchList();
      setMessage("Backup restored.", false);
      window.alert("Backup restored successfully.");
    } catch (error) {
      setMessage("Could not restore backup. Invalid file.", true);
    }
  };
  reader.readAsText(file);
}

function clearAll() {
  if (!state.transactions.length) return;
  const confirmed = window.confirm("Clear all transactions? This cannot be undone.");
  if (!confirmed) return;
  state.transactions = [];
  saveTransactions();
  render();
}

function handleTransactionTableClick(event) {
  const button = event.target.closest("button[data-id]");
  if (!button) return;
  const id = button.dataset.id;
  const action = button.dataset.action || "delete";

  if (action === "edit") {
    startInlineEdit(id);
    return;
  }

  if (action === "cancel") {
    cancelInlineEdit();
    return;
  }

  if (action === "save") {
    const row = button.closest("tr");
    saveInlineEdit(id, row);
    return;
  }

  if (action === "delete") {
    const confirmed = window.confirm("Delete this transaction?");
    if (!confirmed) return;
    state.transactions = state.transactions.filter((tx) => tx.id !== id);
    if (editingTransactionId === id) {
      editingTransactionId = null;
    }
    saveTransactions();
    render();
  }
}

function handleTransactionTableInput(event) {
  const field = event.target?.dataset?.field;
  if (!field) return;
  if (!["type", "quantity", "price", "fee"].includes(field)) return;
  const row = event.target.closest("tr");
  updateInlineEditRowTotal(row);
}

function bindEvents() {
  if (els.tabList) {
    els.tabList.addEventListener("keydown", handleTabKeydown);
  }
  els.tabButtons.forEach((button) => {
    button.addEventListener("click", () => setActiveTab(button.id, { renderCharts: true }));
  });
  els.txForm.addEventListener("submit", addTransaction);
  els.txTypeButtons.forEach((button) => {
    button.addEventListener("click", () => setTxType(button.dataset.type));
  });
  if (els.setNowBtn) {
    els.setNowBtn.addEventListener("click", () => {
      els.txDate.value = getLocalDatetimeValue();
    });
  }
  els.txQuantity.addEventListener("input", updateTotalPreview);
  els.txPrice.addEventListener("input", updateTotalPreview);
  els.txFee.addEventListener("input", updateTotalPreview);
  els.coinSearch.addEventListener("input", handleCoinSearch);
  els.coinResults.addEventListener("click", (event) => selectCoinFromResults(event.target));
  if (els.sellCoin) {
    els.sellCoin.addEventListener("change", () => applySellSelection(getSellableAssets()));
  }
  if (els.filterCoin) {
    els.filterCoin.addEventListener("change", render);
  }
  els.filterType.addEventListener("change", render);
  els.filterText.addEventListener("input", render);
  els.refreshPricesBtn.addEventListener("click", () => refreshPrices({ silent: false }));
  els.exportCsvBtn.addEventListener("click", exportCsv);
  els.downloadBackupBtn.addEventListener("click", downloadBackup);
  els.restoreBackupBtn.addEventListener("click", () => els.backupFileInput.click());
  els.backupFileInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    restoreBackup(file);
    event.target.value = "";
  });
  els.clearAllBtn.addEventListener("click", clearAll);
  els.txTable.addEventListener("click", handleTransactionTableClick);
  els.txTable.addEventListener("input", handleTransactionTableInput);
  els.txTable.addEventListener("change", handleTransactionTableInput);
}

function init() {
  loadState();
  els.txDate.value = getLocalDatetimeValue();
  setTxType(els.txType.value || "buy");
  updateTotalPreview();
  bindEvents();
  const savedTab = localStorage.getItem(STORAGE_KEYS.activeTab);
  setActiveTab(savedTab || (els.tabButtons[0] ? els.tabButtons[0].id : ""));
  ensureCoinSearchList();
  render();

  if (state.transactions.length && shouldRefreshPrices()) {
    refreshPrices({ silent: true });
  }

  setupInstallPrompt();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register(`./service-worker.js?v=${ASSET_VERSION}`).catch(() => {});
    });
  }
}

document.addEventListener("DOMContentLoaded", init);

const INSTALL_DISMISS_KEY = "cit.install.dismissed";

function getInstallContext() {
  const ua = navigator.userAgent || navigator.vendor || "";
  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
  const isIos = /iphone|ipad|ipod/i.test(ua);
  const isAndroid = /android/i.test(ua);
  const isSamsung = /samsungbrowser/i.test(ua);
  const isEdge = /edg/i.test(ua);
  const isFirefox = /firefox/i.test(ua);
  const isChrome = /chrome|crios/i.test(ua) && !isEdge && !isSamsung && !isFirefox;
  const supportsPrompt = "onbeforeinstallprompt" in window;

  if (isStandalone) {
    return { mode: "installed" };
  }

  if (isIos) {
    return {
      mode: "manual",
      platform: "ios",
      subtitle: "Add the tracker to your Home Screen for a full-screen experience.",
      hint: "iPhone/iPad: tap Share, then Add to Home Screen.",
    };
  }

  if (isAndroid && supportsPrompt && (isChrome || isEdge || isSamsung)) {
    return {
      mode: "prompt",
      platform: "android-supported",
      subtitle: "Install the tracker for quicker launch and offline use.",
      hint: "Chrome/Edge/Samsung: tap Install when your browser shows the prompt.",
    };
  }

  if (isAndroid && isFirefox) {
    return {
      mode: "manual",
      platform: "android-firefox",
      subtitle: "Add the tracker from your browser menu.",
      hint: "Firefox: open the menu (⋮) and choose Install app or Add to Home screen.",
    };
  }

  if (supportsPrompt) {
    return {
      mode: "prompt",
      platform: "desktop-supported",
      subtitle: "Install to open the tracker in its own window.",
      hint: "Use the install icon in your address bar when the browser offers it.",
    };
  }

  return {
    mode: "manual",
    platform: "fallback",
    subtitle: "Install from your browser menu to keep the tracker handy.",
    hint: isAndroid
      ? "Open the browser menu and pick Add to Home screen or Install app."
      : "Use your browser menu to install/pin this site (e.g., Add to Dock on Safari).",
  };
}

function applyInstallCopy(context) {
  if (els.installSubtitle && context.subtitle) {
    els.installSubtitle.textContent = context.subtitle;
  }
  if (els.installHint) {
    els.installHint.textContent = context.hint ?? "";
    els.installHint.hidden = !context.hint;
  }
  if (els.installNowBtn) {
    els.installNowBtn.textContent = context.mode === "manual" ? "Got it" : "Install";
  }
  if (els.installLaterBtn) {
    els.installLaterBtn.textContent = context.mode === "manual" ? "Not now" : "Later";
  }
}

function showInstallPrompt() {
  if (!els.installPrompt) return;
  const dismissed = localStorage.getItem(INSTALL_DISMISS_KEY);
  if (dismissed === "true") return;
  els.installPrompt.hidden = false;
}

function hideInstallPrompt({ dismiss = false } = {}) {
  if (!els.installPrompt) return;
  els.installPrompt.hidden = true;
  if (dismiss) {
    localStorage.setItem(INSTALL_DISMISS_KEY, "true");
  }
}

function setupInstallPrompt() {
  if (!els.installPrompt) return;

  let installContext = getInstallContext();
  applyInstallCopy(installContext);

  if (installContext.mode === "installed") {
    hideInstallPrompt({ dismiss: true });
    return;
  }

  const useNativePrompt = installContext.mode === "prompt";

  if (useNativePrompt) {
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      showInstallPrompt();
    });
  }

  if (els.installNowBtn) {
    els.installNowBtn.addEventListener("click", async () => {
      if (installContext.mode === "manual") {
        hideInstallPrompt({ dismiss: true });
        return;
      }
      if (!deferredInstallPrompt) {
        installContext = { ...installContext, mode: "manual" };
        applyInstallCopy(installContext);
        showInstallPrompt();
        return;
      }
      deferredInstallPrompt.prompt();
      const result = await deferredInstallPrompt.userChoice;
      if (result.outcome === "accepted") {
        hideInstallPrompt({ dismiss: true });
      } else {
        hideInstallPrompt();
      }
      deferredInstallPrompt = null;
    });
  }

  if (els.installLaterBtn) {
    els.installLaterBtn.addEventListener("click", () => hideInstallPrompt({ dismiss: true }));
  }

  window.addEventListener("appinstalled", () => hideInstallPrompt({ dismiss: true }));

  // Fallback: surface the prompt after a short delay if the browser doesn't fire beforeinstallprompt
  const alreadyInstalled =
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true;
  if (!alreadyInstalled) {
    setTimeout(() => {
      if (installContext.mode === "manual" || !deferredInstallPrompt) {
        showInstallPrompt();
      }
    }, 2000);
  }
}
