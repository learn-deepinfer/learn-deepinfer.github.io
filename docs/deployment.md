# Publishing the learning website

The site is [learn-deepinfer.github.io](https://learn-deepinfer.github.io), published with GitHub Pages. It presents DeepInfer source guides, architecture diagrams, and interactive mechanism explanations.

This document describes publishing the website. The diagrams and browser interactions explain framework state and dependencies; they are not a framework execution service.

## Build and preview

```bash
cd web
npm ci
npm run build
npm run preview
```

The build prepares website resources, checks TypeScript, compiles the frontend with Vite, and prerenders the public routes. Upload the complete `web/dist/` directory, including hidden files.

The prerendered output contains:

- 32 route documents: Chinese and English homepages, learning paths, comparisons, architecture pages, and twelve lessons per language.
- Route-specific titles, descriptions, canonical links, and social preview metadata.
- `sitemap.xml`, `robots.txt`, and `.nojekyll`.
- A root redirect to `/zh/` and a `404.html` fallback that preserves the requested URL for client routing.

Each known route has its own `index.html`. Opening or refreshing `/zh/s01/` therefore returns the lesson document directly. Interactive state, search, theme selection, and reading progress are handled in the browser.

## GitHub Pages

The workflow is [`.github/workflows/pages.yml`](../.github/workflows/pages.yml). A push to `main` builds with Node.js 22 and the committed npm lockfile, uploads `web/dist/`, and deploys the Pages artifact. The workflow can also be started manually.

In repository **Settings → Pages**, select **GitHub Actions** as the build source. The default `github.io` domain requires no CNAME or additional DNS configuration.

For another domain root, set `SITE_URL=https://your-domain.example` during the build and configure the Pages domain separately. A project subpath requires additional asset-base and router configuration.

## Check the publication

Open a homepage and a nested lesson directly, then refresh both. Confirm that the requested lesson remains selected. Check the Chinese/English links, source links, diagrams, and social preview image.

Inspect a route's HTML before scripts execute: it should contain the lesson text and its own canonical URL. Check that the sitemap lists the published routes and that an unknown route reaches the site's missing-page view.

The framework references are pinned to DeepInfer commit `8b16149741a4935e1dec8cea27853f273b374c5b`. Review those references whenever the upstream revision changes; publishing the frontend does not update source annotations automatically.
