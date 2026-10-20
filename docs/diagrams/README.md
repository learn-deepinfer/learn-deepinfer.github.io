# Diagram sources

Figures are built with HTML/CSS, SVG connectors, and KaTeX. The PNG exports are used by GitHub Markdown, while the source remains editable.

```bash
cd docs/diagrams
npm ci
npx playwright install chromium
npm run render
```

To use an existing browser, set `PLAYWRIGHT_EXECUTABLE` to its executable path. To render one figure, run `npm run render -- architecture` (or another export name below).

| Source | Export | Purpose |
| :--- | :--- | :--- |
| `hero.html` | `readme-cover.png`, `readme-cover-zh.png` | English and Chinese README covers |
| `gallery.html?kind=architecture` | `architecture.png` | Four responsibilities and their lessons |
| `pipeline.html` | `production-pipeline.png` | DeepInfer request lifecycle |
| `gallery.html?kind=cache` | `cache-timeline.png` | Logical positions and physical blocks |
| `batching.html` | `batching.png` | Static and continuous batch admission |
| `experts.html` | `expert-routing.png` | Dispatch and weighted combination |
| `gallery.html?kind=formulas` | `core-equations.png` | Four conceptual framework equations |

All figures use a shared warm paper / forest green palette and export at twice their CSS dimensions. The diagram renderer checks artboard size and browser script errors. The equations describe concepts; implementation-specific behavior is explained in the architecture guides and pinned source links.
