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

---

## Deploy to GitHub Pages

The repo is ready to push. Run these commands **once** in PowerShell from the `crime-classics-tracker` folder:

### 1. Sign in to GitHub

```powershell
gh auth login
```

Choose: **GitHub.com** → **HTTPS** → **Login with a web browser**, then follow the prompts.

### 2. Deploy

```powershell
.\deploy.ps1
```

This creates a public repo called `crime-classics-tracker`, pushes the code, and enables GitHub Pages. After 1–2 minutes your app will be live at:

```
https://YOUR-GITHUB-USERNAME.github.io/crime-classics-tracker/
```

### 3. Install on iPhone

Open that URL in **Safari** → **Share** → **Add to Home Screen**.

### Manual alternative

If you prefer to create the repo yourself on [github.com/new](https://github.com/new):

```powershell
git remote add origin https://github.com/YOUR-USERNAME/crime-classics-tracker.git
git push -u origin main
```

Then go to **Settings → Pages → Build and deployment → Source: GitHub Actions**.

---

1. Go to [app.netlify.com/drop](https://app.netlify.com/drop)
2. Drag the entire `crime-classics-tracker` folder onto the page
3. Netlify gives you a URL like `https://random-name.netlify.app`
4. Open that URL in **Safari** on your iPhone and follow steps 5–7 above

### Netlify Drop (alternative, no Git needed)

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
