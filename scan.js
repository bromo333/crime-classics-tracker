const ISBN_CACHE_KEY = "crime-classics-isbn-cache";

let scannerActive = false;
let html5Scanner = null;
let zxingReader = null;
let processingScan = false;
let lastScannedIsbn = "";
let lastScanTime = 0;
let scannerStarting = false;

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

function showEnableCameraButton(message) {
  setScannerStatus(message, "error");
  document.getElementById("scanner-enable-camera")?.classList.remove("hidden");
}

function hideEnableCameraButton() {
  document.getElementById("scanner-enable-camera")?.classList.add("hidden");
}

function cameraErrorMessage(error) {
  const name = error?.name || "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Camera blocked. Tap Enable camera below, or allow access in Settings -> Safari -> Camera.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No camera found on this device.";
  }
  if (name === "NotReadableError") {
    return "Camera is in use by another app. Close it and try again.";
  }
  return error?.message || "Could not access the camera.";
}

function showScannerModal() {
  document.getElementById("scanner-modal")?.classList.remove("hidden");
  document.body.classList.add("scanner-open");
  document.getElementById("scanner-view-wrap")?.classList.remove("hidden");
  showVideoScanner();
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
  hideEnableCameraButton();
  document.getElementById("scanner-capture-btn")?.classList.add("hidden");

  list.querySelectorAll(".scanner-match-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      confirmBookMatch(Number(btn.dataset.id), lookup);
    });
  });
}

function hideMatchPicker() {
  document.getElementById("scanner-match-picker")?.classList.add("hidden");
  document.getElementById("scanner-view-wrap")?.classList.remove("hidden");
  document.getElementById("scanner-match-list")?.replaceChildren();
  if (scannerActive) {
    document.getElementById("scanner-capture-btn")?.classList.remove("hidden");
  }
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
  setScannerStatus(`Looking up ISBN ${isbn}...`);

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
      setScannerStatus(`Found "${lookup.title}" - pick the matching title:`);
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

function resumeScanning() {
  processingScan = false;
  if (scannerActive) {
    setScannerStatus("Align the ISBN barcode inside the yellow guide, or tap Snap barcode");
  }
}

function isLikelyIsbn(raw) {
  const isbn = normalizeIsbn(raw);
  if (isbn.length === 13) {
    return isbn.startsWith("978") || isbn.startsWith("979");
  }
  return isbn.length === 10;
}

function onBarcodeDetected(raw) {
  if (!raw || processingScan) return;
  if (!isLikelyIsbn(raw)) return;
  handleIsbn(raw);
}

function isZxingNotFound(error) {
  const name = error?.name || "";
  return name === "NotFoundException" || name === "ChecksumException" || name === "FormatException";
}

function getCameraConstraints() {
  return { video: { facingMode: "environment" } };
}

function showVideoScanner() {
  document.getElementById("scanner-video")?.classList.remove("hidden");
  document.getElementById("scanner-view")?.classList.add("hidden");
  document.getElementById("scanner-capture-btn")?.classList.remove("hidden");
}

function createZxingReader() {
  const reader = new ZXingBrowser.BrowserMultiFormatOneDReader();
  reader.possibleFormats = [
    ZXingBrowser.BarcodeFormat.EAN_13,
    ZXingBrowser.BarcodeFormat.EAN_8,
    ZXingBrowser.BarcodeFormat.UPC_A,
    ZXingBrowser.BarcodeFormat.CODE_128,
  ];
  return reader;
}

function getScannerConfig() {
  const config = {
    fps: 10,
    qrbox: (width, height) => ({
      width: Math.floor(width * 0.98),
      height: Math.floor(height * 0.45),
    }),
    disableFlip: false,
  };

  if (typeof Html5QrcodeSupportedFormats !== "undefined") {
    config.formatsToSupport = [
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.CODE_128,
    ];
  }

  return config;
}

function startHtml5ScannerNow() {
  if (typeof Html5Qrcode === "undefined") {
    throw new Error("Scanner library unavailable.");
  }

  document.getElementById("scanner-video")?.classList.add("hidden");
  document.getElementById("scanner-view")?.classList.remove("hidden");
  document.getElementById("scanner-capture-btn")?.classList.add("hidden");

  if (!html5Scanner) {
    html5Scanner = new Html5Qrcode("scanner-view", { verbose: false });
  }

  return html5Scanner.start(
    { facingMode: "environment" },
    getScannerConfig(),
    (decodedText) => onBarcodeDetected(decodedText),
    () => {}
  );
}

function startZxingScannerNow() {
  if (typeof ZXingBrowser === "undefined") {
    return startHtml5ScannerNow();
  }

  const video = document.getElementById("scanner-video");
  if (!video) {
    throw new Error("Camera preview unavailable.");
  }

  showVideoScanner();
  zxingReader = createZxingReader();

  return zxingReader.decodeFromConstraints(
    getCameraConstraints(),
    video,
    (result, error) => {
      if (result) {
        onBarcodeDetected(result.getText());
        return;
      }
      if (error && !isZxingNotFound(error)) {
        console.warn("ZXing scan error:", error);
      }
    }
  );
}

function snapBarcodeNow() {
  if (processingScan) return;

  const video = document.getElementById("scanner-video");
  if (!video || !video.videoWidth) {
    setScannerStatus("Camera not ready yet - wait a moment and try again", "error");
    return;
  }

  if (typeof ZXingBrowser === "undefined") {
    setScannerStatus("Snap capture needs the scanner library - try manual entry", "error");
    return;
  }

  if (!zxingReader) {
    zxingReader = createZxingReader();
  }

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    setScannerStatus("Could not capture frame", "error");
    return;
  }

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  setScannerStatus("Checking barcode...");

  try {
    const result = zxingReader.decodeFromCanvas(canvas);
    if (result?.getText()) {
      onBarcodeDetected(result.getText());
      return;
    }
    setScannerStatus("No barcode found - move closer, hold steady, tap Snap again", "error");
  } catch (error) {
    if (isZxingNotFound(error)) {
      setScannerStatus("No barcode found - move closer, hold steady, tap Snap again", "error");
    } else {
      setScannerStatus("Could not read barcode - try brighter light or manual entry", "error");
      console.warn("Snap decode error:", error);
    }
  }
}

function startScannerNow() {
  if (scannerStarting) return;
  scannerStarting = true;

  if (!window.isSecureContext) {
    scannerStarting = false;
    showEnableCameraButton("Camera requires HTTPS. Open the app via your GitHub Pages URL.");
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia && typeof ZXingBrowser === "undefined" && typeof Html5Qrcode === "undefined") {
    scannerStarting = false;
    showEnableCameraButton("Camera not supported in this browser.");
    return;
  }

  hideEnableCameraButton();
  hideMatchPicker();
  setScannerStatus("Requesting camera access...");
  scannerActive = true;
  processingScan = false;

  const startPromise =
    typeof ZXingBrowser !== "undefined" ? startZxingScannerNow() : startHtml5ScannerNow();

  Promise.resolve(startPromise)
    .then(() => {
      scannerStarting = false;
      setScannerStatus("Align the ISBN barcode inside the yellow guide, or tap Snap barcode");
      hideEnableCameraButton();
    })
    .catch((error) => {
      console.warn("Primary scanner failed, trying fallback:", error);

      if (typeof Html5Qrcode !== "undefined") {
        startHtml5ScannerNow()
          .then(() => {
            scannerStarting = false;
            setScannerStatus("Align the ISBN barcode inside the yellow guide");
            hideEnableCameraButton();
          })
          .catch((fallbackError) => {
            scannerStarting = false;
            scannerActive = false;
            console.error(fallbackError);
            showEnableCameraButton(cameraErrorMessage(error));
            window.CollectionTracker?.showToast("Could not start camera");
          });
        return;
      }

      scannerStarting = false;
      scannerActive = false;
      console.error(error);
      showEnableCameraButton(cameraErrorMessage(error));
      window.CollectionTracker?.showToast("Could not start camera");
    });
}

async function stopScanner() {
  scannerActive = false;
  scannerStarting = false;

  if (zxingReader) {
    try {
      zxingReader.reset();
    } catch {
      // Already stopped.
    }
    zxingReader = null;
  }

  const video = document.getElementById("scanner-video");
  if (video) {
    video.srcObject = null;
  }

  if (html5Scanner) {
    try {
      const state = html5Scanner.getState?.();
      if (state === Html5QrcodeScannerState?.SCANNING || state === Html5QrcodeScannerState?.PAUSED) {
        await html5Scanner.stop();
      }
      html5Scanner.clear();
    } catch {
      // Already stopped.
    }
  }

  document.getElementById("scanner-capture-btn")?.classList.add("hidden");
}

async function closeScanner() {
  await stopScanner();
  hideMatchPicker();
  hideEnableCameraButton();
  setScannerStatus("");
  document.getElementById("scanner-modal")?.classList.add("hidden");
  document.body.classList.remove("scanner-open");
}

function setupScanner() {
  if (setupScanner.initialized) return;
  setupScanner.initialized = true;

  document.getElementById("scanner-close")?.addEventListener("click", closeScanner);
  document.getElementById("scanner-cancel-match")?.addEventListener("click", () => {
    hideMatchPicker();
    resumeScanning();
  });
  document.getElementById("scanner-enable-camera")?.addEventListener("click", (event) => {
    event.preventDefault();
    stopScanner().finally(() => startScannerNow());
  });
  document.getElementById("scanner-capture-btn")?.addEventListener("click", (event) => {
    event.preventDefault();
    snapBarcodeNow();
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

setupScanner.initialized = false;

window.startCrimeScanner = function startCrimeScanner(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();

  showScannerModal();

  if (!window.isSecureContext) {
    showEnableCameraButton("Camera requires HTTPS. Open the app via your GitHub Pages URL.");
    return;
  }

  if (scannerActive || scannerStarting) {
    return;
  }

  startScannerNow();
};

window.openScanner = window.startCrimeScanner;
window.closeScanner = closeScanner;
window.setupScanner = setupScanner;

setupScanner();
