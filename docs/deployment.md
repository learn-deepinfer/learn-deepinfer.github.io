# Website deployment

The public site is https://learn-deepinfer.github.io, hosted by GitHub Pages.

The repository uses the GitHub Actions Pages workflow in `.github/workflows/pages.yml`.
Pushes to `main` build the website with Node.js 22 and the committed npm lockfile, then upload `web/dist/` as the Pages artifact. The workflow can also be run manually from the Actions tab.

In repository Settings → Pages, the build source must be **GitHub Actions**. The default github.io address needs no CNAME or DNS record.

## Preview the production build

```bash
cd web
npm ci
npm run build
npm run preview
```

`prepare-source.mjs` assembles the standalone Chapter 1 ZIP and copies the real demo media. Vite compiles the app. `prerender.mjs` then creates 32 Chinese/English route documents, per-page metadata, `sitemap.xml`, `robots.txt`, `.nojekyll`, and a 404 fallback.

Each known route has its own `index.html`, so opening or refreshing `/zh/s01/` returns a real document. Unknown routes show the learning-path 404 page. Search, progress, theme, and interactive controls run in the browser.

To build for another domain root, set `SITE_URL=https://your-domain.example` when running `npm run build`. Update the repository Pages domain settings separately. A project subpath deployment needs additional router/base configuration.

Brand assets and their generation records are in `web/public/brand/`. Model weights, Python environments, Node dependencies, and local results are excluded from version control.
