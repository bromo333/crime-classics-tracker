# British Library Crime Classics Tracker

A personal web app to track which books from the [British Library Crime Classics](https://shop.bl.uk/pages/crime-classics-list) series you own, have read, or want to buy.

Installable on **iPhone** as a home-screen app (PWA).

## Features

- **All 151 titles** from the official BL list (including upcoming releases)
- **Three statuses per book**: Owned, Read, Wishlist
- **Search** by title, author, or series number
- **Filters**: All, Owned, Missing, Read, Wishlist
- **Sort** by series number, title, author, or publication date
- **Progress stats** with collection completion percentage
- **Export / Import** your collection as JSON (for backups or moving between devices)
- **Offline support** once installed
- **Local storage** — no account needed; data stays on your device

---

## Install on iPhone

iPhone requires the app to be served over **HTTPS** (a website URL). Opening the file directly from your computer won't work on your phone.

### Option A: GitHub Pages (free, recommended)

1. Create a GitHub repository and upload the `crime-classics-tracker` folder
2. Go to **Settings → Pages → Deploy from branch**
3. Choose `main` branch, `/ (root)` folder, and save
4. Wait a minute, then open your URL (e.g. `https://yourname.github.io/crime-classics-tracker/`) in **Safari** on your iPhone
5. Tap the **Share** button (square with arrow)
6. Scroll down and tap **Add to Home Screen**
7. Tap **Add**

The app now appears on your home screen like a native app and works offline.

### Option B: Netlify Drop (free, no Git needed)

1. Go to [app.netlify.com/drop](https://app.netlify.com/drop)
2. Drag the entire `crime-classics-tracker` folder onto the page
3. Netlify gives you a URL like `https://random-name.netlify.app`
4. Open that URL in **Safari** on your iPhone and follow steps 5–7 above

### Option C: Test on your local network

If you have Python installed on your PC:

```bash
cd crime-classics-tracker
python -m http.server 8080
```

Find your PC's local IP (e.g. `192.168.1.42`), then on your iPhone (same Wi‑Fi) open `http://192.168.1.42:8080` in Safari.

> Note: local HTTP won't enable offline caching, but you can still use Add to Home Screen for quick access.

---

## Using the app

| Button | Meaning |
|--------|---------|
| Book icon | Mark as **owned** |
| Eye icon | Mark as **read** |
| Star icon | Add to **wishlist** |

Marking a book as owned clears its wishlist status, and vice versa.

Use **Export** to download a JSON backup. Use **Import** to restore from a previous export.

When visiting in Safari (before installing), a banner at the top explains how to add the app to your home screen.

---

## Desktop use

Open `index.html` in your browser for quick local use on a computer. For full PWA features (offline, install), serve over HTTP:

```bash
cd crime-classics-tracker
python -m http.server 8080
```

Then open `http://localhost:8080`.

---

## Files

| File | Purpose |
|------|---------|
| `index.html` | App shell |
| `styles.css` | Styling (includes iPhone safe-area support) |
| `app.js` | App logic & service worker registration |
| `sw.js` | Service worker for offline caching |
| `manifest.webmanifest` | PWA manifest for install |
| `icons/` | App icons for home screen |
| `books-data.js` | Book catalogue |
| `books.json` | Source catalogue data |

---

## Updating the book list

When the British Library adds new titles, update `books.json` from their [official list](https://shop.bl.uk/pages/crime-classics-list), then regenerate `books-data.js`:

```bash
node -e "const fs=require('fs'); fs.writeFileSync('books-data.js', 'const BOOKS = '+fs.readFileSync('books.json','utf8')+';');"
```

After updating, bump the version in `sw.js` (`CACHE_NAME`) so installed apps fetch the new data.
