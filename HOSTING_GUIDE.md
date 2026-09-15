# Skybreak Flight Combat — Web Hosting Guide

This guide explains how to host your customized, high-performance Skybreak game on any free web hosting platform in minutes.

---

## ⚡ Option 1: Netlify Drag & Drop (Easiest — 30 Seconds, No Terminal)

Netlify is the recommended host for Skybreak.

1. Open **[app.netlify.com/drop](https://app.netlify.com/drop)** in your browser (log in or create a free account).
2. Take the **`dist`** folder (or unzipped `skybreak-deploy-ready-dist.zip`).
3. Drag and drop the folder directly into the browser window.
4. **Done!** Netlify will instantly give you a live HTTPS URL (e.g. `https://your-custom-name.netlify.app/`).
   - The included `_headers` file will automatically enforce all security and privacy headers.

---

## 🌐 Option 2: Netlify via GitHub (Automatic Continuous Deployment)

If you have a GitHub repository:
1. Push this project code to your GitHub repo.
2. Go to [Netlify](https://app.netlify.com/) ➔ **Add new site** ➔ **Import an existing project**.
3. Select your GitHub repository.
4. Netlify will auto-detect settings from `netlify.toml`:
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
5. Click **Deploy**. Every time you push changes, Netlify will build and deploy automatically!

---

## ▲ Option 3: Vercel

1. Open **[vercel.com](https://vercel.com/)** and click **Add New Project**.
2. Select your GitHub repository or use the Vercel CLI (`npx vercel`).
3. Vercel will auto-detect settings from `vercel.json`:
   - **Build command**: `npm run build`
   - **Output directory**: `dist`
4. Click **Deploy**. Your game is live with global CDN acceleration and full privacy headers.

---

## 🐙 Option 4: GitHub Pages

1. In `vite.config.js`, `base: './'` is already configured for relative paths.
2. Run `npm run build`.
3. Push the `dist` folder to your `gh-pages` branch, or configure GitHub Actions to deploy from `dist`.
4. Your game will be available at `https://<username>.github.io/<repo>/`.

---

## 🔒 Security & Privacy Features Included
- **Content-Security-Policy (CSP)**: Locks down script/asset origins.
- **X-Frame-Options: SAMEORIGIN**: Prevents iframe clickjacking.
- **Permissions-Policy**: Restricts camera, mic, and location.
- **Immutable Asset Caching**: 1-year cache on hashed CSS and JS chunks for blazing fast repeat visits.
