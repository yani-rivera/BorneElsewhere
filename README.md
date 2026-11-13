# Born Elsewhere, Living Here (interactive)

Azimuthal equidistant map centred on Honduras: one line per country of birth, 2013 census.

- `config.json`  title, centre, zoom presets, colour groups, sources
- `data/`        census flows (country of birth x department) and Natural Earth 1:50m outlines
- `src/`         `template.html`, `style.css`, `app.js` (Geo, Model, MapView, Labels, Tip, Panel, App)
- `build.py`     writes `dist/index.html` (single file) and `dist/provenance.json`

Build: `python3 build.py`. Publish: copy `dist/index.html` to a GitHub Pages repo.
