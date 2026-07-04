const STORAGE_KEY = "crime-classics-collection";

const ICONS = {
  owned: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
  read: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  wishlist: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
};

let books = [];
let collection = loadCollection();
let filter = "all";
let sortBy = "number";
let searchQuery = "";

const els = {
  list: document.getElementById("book-list"),
  search: document.getElementById("search"),
  sort: document.getElementById("sort"),
  resultsCount: document.getElementById("results-count"),
  statOwned: document.getElementById("stat-owned"),
  statMissing: document.getElementById("stat-missing"),
  statRead: document.getElementById("stat-read"),
  statPct: document.getElementById("stat-pct"),
  progressFill: document.getElementById("progress-fill"),
  progressBar: document.querySelector(".progress-bar"),
  toast: document.getElementById("toast"),
  exportBtn: document.getElementById("export-btn"),
  importFile: document.getElementById("import-file"),
};

function loadCollection() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCollection() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(collection));
}

function getBookState(id) {
  return collection[id] || { owned: false, read: false, wishlist: false };
}

function setBookState(id, key, value) {
  const state = getBookState(id);
  state[key] = value;

  if (key === "owned" && value) {
    state.wishlist = false;
  }
  if (key === "wishlist" && value) {
    state.owned = false;
  }

  collection[id] = state;
  saveCollection();
  updateStats();
  render();
}

function formatDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function isUpcoming(pubDate) {
  return new Date(pubDate + "T00:00:00") > new Date();
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => els.toast.classList.remove("show"), 2500);
}

function updateStats() {
  const inPrint = books.filter((b) => !b.outOfPrint);
  const ownedCount = books.filter((b) => getBookState(b.id).owned).length;
  const readCount = books.filter((b) => getBookState(b.id).read).length;
  const missingCount = inPrint.length - books.filter((b) => !b.outOfPrint && getBookState(b.id).owned).length;
  const pct = inPrint.length ? Math.round((ownedCount / inPrint.length) * 100) : 0;

  els.statOwned.textContent = ownedCount;
  els.statMissing.textContent = Math.max(0, missingCount);
  els.statRead.textContent = readCount;
  els.statPct.textContent = pct + "%";
  els.progressFill.style.width = pct + "%";
  els.progressBar.setAttribute("aria-valuenow", pct);
}

function sortBooks(list) {
  const sorted = [...list];
  switch (sortBy) {
    case "title":
      sorted.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case "author":
      sorted.sort((a, b) => a.author.localeCompare(b.author) || a.id - b.id);
      break;
    case "date-desc":
      sorted.sort((a, b) => b.pubDate.localeCompare(a.pubDate) || a.id - b.id);
      break;
    case "date-asc":
      sorted.sort((a, b) => a.pubDate.localeCompare(b.pubDate) || a.id - b.id);
      break;
    default:
      sorted.sort((a, b) => a.id - b.id);
  }
  return sorted;
}

function matchesFilter(book, state) {
  switch (filter) {
    case "owned":
      return state.owned;
    case "missing":
      return !state.owned && !book.outOfPrint;
    case "read":
      return state.read;
    case "wishlist":
      return state.wishlist;
    default:
      return true;
  }
}

function matchesSearch(book) {
  if (!searchQuery) return true;
  const q = searchQuery.toLowerCase();
  return (
    book.title.toLowerCase().includes(q) ||
    book.author.toLowerCase().includes(q) ||
    String(book.id).includes(q)
  );
}

function renderBookCard(book) {
  const state = getBookState(book.id);
  const upcoming = isUpcoming(book.pubDate);

  const card = document.createElement("article");
  card.className = "book-card" + (state.owned ? " owned" : "");
  card.setAttribute("role", "listitem");
  card.dataset.id = book.id;

  const badges = [];
  if (book.outOfPrint) badges.push('<span class="badge badge-oop">Out of print</span>');
  if (upcoming) badges.push('<span class="badge badge-upcoming">Upcoming</span>');

  card.innerHTML = `
    <span class="book-number">${book.id}</span>
    <div class="book-info">
      <h2 class="book-title">${escapeHtml(book.title)}</h2>
      <p class="book-meta">
        <span>${escapeHtml(book.author)}</span>
        <span>${formatDate(book.pubDate)}</span>
        ${badges.join("")}
      </p>
    </div>
    <div class="book-actions">
      <button class="toggle-btn ${state.owned ? "active-owned" : ""}" data-action="owned" title="Owned" aria-pressed="${state.owned}">${ICONS.owned}</button>
      <button class="toggle-btn ${state.read ? "active-read" : ""}" data-action="read" title="Read" aria-pressed="${state.read}">${ICONS.read}</button>
      <button class="toggle-btn ${state.wishlist ? "active-wishlist" : ""}" data-action="wishlist" title="Wishlist" aria-pressed="${state.wishlist}">${ICONS.wishlist}</button>
    </div>
  `;

  card.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      const current = getBookState(book.id)[action];
      setBookState(book.id, action, !current);
    });
  });

  return card;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function render() {
  const filtered = sortBooks(books).filter((book) => {
    const state = getBookState(book.id);
    return matchesFilter(book, state) && matchesSearch(book);
  });

  els.list.replaceChildren();
  filtered.forEach((book) => els.list.appendChild(renderBookCard(book)));

  const label = filtered.length === 1 ? "1 book" : `${filtered.length} books`;
  els.resultsCount.textContent = label + (searchQuery || filter !== "all" ? " matching your filters" : "");
}

function exportCollection() {
  const data = {
    exportedAt: new Date().toISOString(),
    source: "https://shop.bl.uk/pages/crime-classics-list",
    collection,
    stats: {
      owned: books.filter((b) => getBookState(b.id).owned).length,
      read: books.filter((b) => getBookState(b.id).read).length,
      wishlist: books.filter((b) => getBookState(b.id).wishlist).length,
    },
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `crime-classics-collection-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Collection exported");
}

function importCollection(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.collection && typeof data.collection === "object") {
        collection = data.collection;
        saveCollection();
        updateStats();
        render();
        showToast("Collection imported successfully");
      } else {
        showToast("Invalid backup file");
      }
    } catch {
      showToast("Could not read backup file");
    }
  };
  reader.readAsText(file);
}

document.querySelectorAll(".filter-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    filter = btn.dataset.filter;
    render();
  });
});

els.search.addEventListener("input", (e) => {
  searchQuery = e.target.value.trim();
  render();
});

els.sort.addEventListener("change", (e) => {
  sortBy = e.target.value;
  render();
});

els.exportBtn.addEventListener("click", exportCollection);

els.importFile.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) importCollection(file);
  e.target.value = "";
});

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function isIosSafari() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) && !isStandalone();
}

function setupInstallBanner() {
  const banner = document.getElementById("install-banner");
  const dismiss = document.getElementById("install-dismiss");
  if (!banner || !dismiss) return;

  const dismissed = localStorage.getItem("install-banner-dismissed") === "1";
  if (isIosSafari() && !dismissed) {
    banner.classList.remove("hidden");
  }

  dismiss.addEventListener("click", () => {
    banner.classList.add("hidden");
    localStorage.setItem("install-banner-dismissed", "1");
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Service workers require HTTPS; fail silently on file://
    });
  });
}

function init() {
  if (typeof BOOKS === "undefined") {
    els.list.innerHTML = '<p style="color: var(--accent)">Could not load book data.</p>';
    return;
  }

  books = BOOKS;
  updateStats();
  render();
  setupInstallBanner();
  registerServiceWorker();

  window.CollectionTracker = {
    get books() {
      return books;
    },
    markOwned(id) {
      setBookState(id, "owned", true);
    },
    showToast,
    escapeHtml,
  };

  if (typeof setupScanner === "function") {
    setupScanner();
  }
}

init();
