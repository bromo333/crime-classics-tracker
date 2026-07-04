const ISBN_CACHE_KEY = "crime-classics-isbn-cache";
const HTML5_QRCODE_URL = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";

let scannerActive = false;
let html5Scanner = null;
let nativeStream = null;
let nativeDetectLoop = null;
let processingScan = false;
let lastScannedIsbn = "";
let lastScanTime = 0;

function loadIsbnCache() {
  try {
    return JSON.parse(localStorage.getItem(ISBN_CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveIsbnCache(cache) {
  localStorage.setItem(ISBN_CACHE_KEY, JSON.stringify(cache));
}

function normalizeIsbn(raw) {
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 10) {
    return isbn10to13(digits);
  }
  if (digits.length >= 13) {
    return digits.slice(0, 13);
  }
  return digits;
}

function isbn10to13(isbn10) {
  const core = "978" + isbn10.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(core[i], 10) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return core + String(check);
}

function normalizeTitle(title) {
  return String(title)
    .toLowerCase()
    .replace(/british library crime classics/gi, "")
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleMatchScore(catalogueTitle, lookupTitle) {
  const a = normalizeTitle(catalogueTitle);
  const b = normalizeTitle(lookupTitle);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (b.includes(a) || a.includes(b)) return 90;

  const wordsA = a.split(" ").filter((w) => w.length > 2);
  if (!wordsA.length) return 0;

  let matched = 0;
  for (const word of wordsA) {
    if (b.includes(word)) matched++;
  }

  return Math.round((matched / wordsA.length) * 80);
}

function findBookMatches(lookupTitle, lookupAuthors = []) {
  const ct = window.CollectionTracker;
  const scored = ct.books
    .map((book) => {
      let score = titleMatchScore(book.title, lookupTitle);
      if (lookupAuthors.length) {
        const authorNeedle = normalizeTitle(lookupAuthors.join(" "));
        const authorHay = normalizeTitle(book.author);
        if (authorHay && authorNeedle && (authorHay.includes(authorNeedle) || authorNeedle.includes(authorHay))) {
          score += 10;
        }
      }
      return { book, score };
    })
    .filter((entry) => entry.score >= 55)
    .sort((x, y) => y.score - x.score);

  return scored;
}

async function lookupIsbn(isbn) {
  const cache = loadIsbnCache();
  if (cache[isbn]) {
    return cache[isbn];
  }

  const response = await fetch(`https://openlibrary.org/isbn/${isbn}.json`);
  if (!response.ok) {
    throw new Error("Book not found for this ISBN");
  }

  const data = await response.json();
  const authors = (data.authors || [])
    .map((author) => author.name || author.key || "")
    .filter(Boolean);

  const result = {
    isbn,
    title: data.title || "",
    authors,
    publishers: (data.publishers || []).map((p) => p.name || p).filter(Boolean),
  };

  cache[isbn] = result;
  saveIsbnCache(cache);
  return result;
}

function setScannerStatus(message, type = "") {
  const status = document.getElementById("scanner-status");
  if (!status) return;
  status.textContent = message;
  status.className = "scanner-status" + (type ? ` scanner-status-${type}` : "");
}

function showMatchPicker(matches, lookup) {
  const ct = window.CollectionTracker;
  const picker = document.getElementById("scanner-match-picker");
  const list = document.getElementById("scanner-match-list");
  if (!picker || !list) return;

  list.innerHTML = matches
    .slice(0, 5)
    .map(
      ({ book, score }) => `
      <button type="button" class="scanner-match-item" data-id="${book.id}">
        <span class="scanner-match-num">#${book.id}</span>
        <span class="scanner-match-info">
          <strong>${ct.escapeHtml(book.title)}</strong>
          <span>${ct.escapeHtml(book.author)} · ${score}% match</span>
        </span>
      </button>
    `
    )
    .join("");

  picker.classList.remove("hidden");
  document.getElementById("scanner-view-wrap")?.classList.add("hidden");

  list.querySelectorAll(".scanner-match-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      confirmBookMatch(Number(btn.dataset.id), lookup);
    });
  });
}

function hideMatchPicker() {
  document.getElementById("scanner-match-picker")?.classList.add("hidden");
  document.getElementById("scanner-view-wrap")?.classList.remove("hidden");
  document.getElementById("scanner-match-list").replaceChildren();
}

function confirmBookMatch(bookId, lookup) {
  const ct = window.CollectionTracker;
  const book = ct.books.find((b) => b.id === bookId);
  if (!book) return;

  const cache = loadIsbnCache();
  cache[lookup.isbn] = { ...lookup, bookId };
  saveIsbnCache(cache);

  ct.markOwned(bookId);
  hideMatchPicker();
  setScannerStatus(`Added #${book.id}: ${book.title}`, "success");
  ct.showToast(`Added: ${book.title}`);
  resumeScanning();
}

async function handleIsbn(rawIsbn) {
  const isbn = normalizeIsbn(rawIsbn);
  if (!isbn || isbn.length < 10) return;

  const now = Date.now();
  if (processingScan || (isbn === lastScannedIsbn && now - lastScanTime < 3000)) {
    return;
  }

  processingScan = true;
  lastScannedIsbn = isbn;
  lastScanTime = now;
  pauseScanning();
  setScannerStatus(`Looking up ISBN ${isbn}…`);

  try {
    const cache = loadIsbnCache();
    let lookup = cache[isbn];

    if (lookup?.bookId) {
      const book = window.CollectionTracker.books.find((b) => b.id === lookup.bookId);
      if (book) {
        window.CollectionTracker.markOwned(book.id);
        setScannerStatus(`Added #${book.id}: ${book.title}`, "success");
        window.CollectionTracker.showToast(`Added: ${book.title}`);
        resumeScanning();
        return;
      }
    }

    if (!lookup?.title) {
      lookup = await lookupIsbn(isbn);
    }

    const matches = findBookMatches(lookup.title, lookup.authors);

    if (matches.length === 1 && matches[0].score >= 70) {
      confirmBookMatch(matches[0].book.id, lookup);
      return;
    }

    if (matches.length > 0) {
      setScannerStatus(`Found "${lookup.title}" — pick the matching title:`);
      showMatchPicker(matches, lookup);
      return;
    }

    setScannerStatus(
      `"${lookup.title}" isn't in the Crime Classics list. Try manual entry or another copy.`,
      "error"
    );
    window.CollectionTracker.showToast("No matching Crime Classic found");
    resumeScanning();
  } catch (error) {
    setScannerStatus(error.message || "Lookup failed", "error");
    window.CollectionTracker.showToast("Could not look up ISBN");
    resumeScanning();
  } finally {
    processingScan = false;
  }
}

function loadScript(url) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${url}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = url;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Could not load scanner library"));
    document.head.appendChild(script);
  });
}

function pauseScanning() {
  // Scanner engines stay active; processingScan gate prevents duplicate lookups.
}

function resumeScanning() {
  processingScan = false;
  if (scannerActive) {
    setScannerStatus("Aim at the ISBN barcode on the back cover");
  }
}

async function startNativeScanner() {
  if (!("BarcodeDetector" in window)) {
    return false;
  }

  const formats = await BarcodeDetector.getSupportedFormats();
  const supported = formats.filter((f) => f === "ean_13" || f === "ean_8");
  if (!supported.length) return false;

  const video = document.getElementById("scanner-video");
  if (!video) return false;

  nativeStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" } },
    audio: false,
  });

  video.srcObject = nativeStream;
  await video.play();

  const detector = new BarcodeDetector({ formats: supported });

  const tick = async () => {
    if (!scannerActive) return;

    if (!processingScan) {
      try {
        const barcodes = await detector.detect(video);
        for (const code of barcodes) {
          if (code.rawValue) {
            handleIsbn(code.rawValue);
            break;
          }
        }
      } catch {
        // Ignore transient detection errors.
      }
    }

    nativeDetectLoop = requestAnimationFrame(tick);
  };

  nativeDetectLoop = requestAnimationFrame(tick);
  return true;
}

async function startHtml5Scanner() {
  await loadScript(HTML5_QRCODE_URL);

  const container = document.getElementById("scanner-view");
  if (!container || typeof Html5Qrcode === "undefined") {
    throw new Error("Scanner library unavailable");
  }

  html5Scanner = new Html5Qrcode("scanner-view", { verbose: false });

  await html5Scanner.start(
    { facingMode: "environment" },
    {
      fps: 10,
      qrbox: (width, height) => ({
        width: Math.min(width * 0.92, 340),
        height: Math.min(height * 0.38, 160),
      }),
      aspectRatio: 1.777,
    },
    (decodedText) => handleIsbn(decodedText),
    () => {}
  );
}

async function stopScanner() {
  scannerActive = false;

  if (nativeDetectLoop) {
    cancelAnimationFrame(nativeDetectLoop);
    nativeDetectLoop = null;
  }

  if (nativeStream) {
    nativeStream.getTracks().forEach((track) => track.stop());
    nativeStream = null;
  }

  const video = document.getElementById("scanner-video");
  if (video) {
    video.srcObject = null;
  }

  if (html5Scanner) {
    try {
      await html5Scanner.stop();
      html5Scanner.clear();
    } catch {
      // Already stopped.
    }
    html5Scanner = null;
  }

  document.getElementById("scanner-view-wrap")?.classList.add("hidden");
  document.getElementById("scanner-video")?.classList.add("hidden");
  document.getElementById("scanner-view")?.classList.remove("hidden");
}

async function openScanner() {
  const modal = document.getElementById("scanner-modal");
  if (!modal) return;

  modal.classList.remove("hidden");
  document.body.classList.add("scanner-open");
  hideMatchPicker();
  setScannerStatus("Starting camera…");

  scannerActive = true;
  processingScan = false;

  try {
    const nativeStarted = await startNativeScanner();
    if (nativeStarted) {
      document.getElementById("scanner-video")?.classList.remove("hidden");
      document.getElementById("scanner-view")?.classList.add("hidden");
      document.getElementById("scanner-view-wrap")?.classList.remove("hidden");
      setScannerStatus("Aim at the ISBN barcode on the back cover");
      return;
    }

    document.getElementById("scanner-video")?.classList.add("hidden");
    document.getElementById("scanner-view")?.classList.remove("hidden");
    document.getElementById("scanner-view-wrap")?.classList.remove("hidden");
    await startHtml5Scanner();
    setScannerStatus("Aim at the ISBN barcode on the back cover");
  } catch (error) {
    setScannerStatus(error.message || "Camera access denied", "error");
    window.CollectionTracker.showToast("Could not start camera");
  }
}

async function closeScanner() {
  await stopScanner();
  hideMatchPicker();
  document.getElementById("scanner-modal")?.classList.add("hidden");
  document.body.classList.remove("scanner-open");
  setScannerStatus("");
}

function setupScanner() {
  document.getElementById("scan-btn")?.addEventListener("click", openScanner);
  document.getElementById("scanner-close")?.addEventListener("click", closeScanner);
  document.getElementById("scanner-cancel-match")?.addEventListener("click", () => {
    hideMatchPicker();
    resumeScanning();
  });

  document.getElementById("scanner-modal")?.addEventListener("click", (event) => {
    if (event.target.id === "scanner-modal") closeScanner();
  });

  document.getElementById("scanner-manual-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.getElementById("scanner-manual-isbn");
    const value = input?.value.trim();
    if (!value) return;
    await handleIsbn(value);
    if (input) input.value = "";
  });
}

window.setupScanner = setupScanner;
