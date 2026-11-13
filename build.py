#!/usr/bin/env python3
"""Build dist/index.html: one self-contained page from src/ + data/ + config.json.

Usage: python3 build.py [--local-libs DIR]
Records provenance (version, build time, input checksums) in the page and in dist/provenance.json.
"""
import argparse, hashlib, json, datetime, pathlib

ROOT = pathlib.Path(__file__).parent
SCRIPT_VERSION = "1.0.0"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--local-libs", help="folder holding d3.min.js and topojson.min.js, for offline preview")
    args = ap.parse_args()

    cfg = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
    data_path = ROOT / cfg["source"]["data_file"]
    world_path = ROOT / cfg["source"]["basemap_file"]
    prov = {
        "page_version": cfg["version"],
        "build_script": f"build.py {SCRIPT_VERSION}",
        "built_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "inputs": {data_path.name: sha(data_path), world_path.name: sha(world_path),
                   "config.json": sha(ROOT / "config.json")},
        "source": cfg["source"],
    }
    html = (ROOT / "src/template.html").read_text(encoding="utf-8")
    parts = {
        "/*__CSS__*/": (ROOT / "src/style.css").read_text(encoding="utf-8"),
        "/*__APP__*/": (ROOT / "src/app.js").read_text(encoding="utf-8"),
        "/*__CONFIG__*/": json.dumps(cfg, ensure_ascii=False),
        "/*__DATA__*/": data_path.read_text(encoding="utf-8"),
        "/*__WORLD__*/": world_path.read_text(encoding="utf-8"),
        "/*__PROV__*/": json.dumps(prov, ensure_ascii=False),
        "__TITLE__": cfg["title"],
    }
    for k, v in parts.items():
        html = html.replace(k, v)
    out = ROOT / "dist/index.html"
    if args.local_libs:
        libs = pathlib.Path(args.local_libs)
        import re
        html = re.sub(r'<script src="https://cdnjs[^"]*d3\.min\.js"></script>',
                      lambda m: "<script>" + (libs / "d3.min.js").read_text() + "</script>", html)
        html = re.sub(r'<script src="https://cdnjs[^"]*topojson\.min\.js"></script>',
                      lambda m: "<script>" + (libs / "topojson.min.js").read_text() + "</script>", html)
        out = ROOT / "dist/preview.html"
    out.write_text(html, encoding="utf-8")
    (ROOT / "dist/provenance.json").write_text(json.dumps(prov, indent=2, ensure_ascii=False), encoding="utf-8")
    print(out, len(html) // 1024, "KiB")


if __name__ == "__main__":
    main()
