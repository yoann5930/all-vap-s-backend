import html
import json
import re
import urllib.request
from pathlib import Path

UA = "AllVapsCatalogBot/1.0 (double-dragon; contact@allvaps.local)"
url = "https://biarritz-lab.com/collections/double-dragon/products.json?limit=50"
req = urllib.request.Request(url, headers={"User-Agent": UA})
with urllib.request.urlopen(req, timeout=30) as r:
    data = json.load(r)

# Flavors from official collection page cards
FLAVORS = {
    "fruit-du-dragon-cerise-double-dragon-50-ml-00-mg": "Fruit du dragon - Cerise",
    "fruit-du-dragon-fraise-double-dragon-50-ml-00-mg": "Fruit du dragon - Fraise",
    "fruit-du-dragon-framboise-double-dragon-50-ml-00-mg": "Fruit du dragon - Framboise",
    "fruit-du-dragon-limonade-double-dragon-50-ml-00-mg": "Fruit du dragon - Limonade",
    "fruit-du-dragon-mandarine-double-dragon-50-ml-00-mg": "Fruit du dragon - Mandarine",
    "fruit-du-dragon-mure-double-dragon-50-ml-00-mg": "Fruit du dragon - Mure",
    "fruit-du-dragon-passion-double-dragon-50-ml-00-mg": "Fruit du dragon - Passion",
    "fruit-du-dragon-peche-double-dragon-50-ml-00-mg": "Fruit du dragon - Pêche",
    "fruit-du-dragon-vanilla-ice-double-dragon-50-ml-00-mg": "Fruit du dragon - Vanille",
    "fruit-du-dragon-violette-double-dragon-50-ml-00-mg": "Fruit du dragon - Violette",
    "triple-dragon-double-dragon-100-ml-00-mg": "Fruit du dragon - Energy drink",
}

out = []
for p in data["products"]:
    v = p["variants"][0]
    img = (p.get("images") or [{}])[0].get("src")
    body = re.sub("<[^>]+>", " ", p.get("body_html") or "")
    body = html.unescape(re.sub(r"\s+", " ", body)).strip()
    title = p["title"]
    name = re.sub(r"\s*-\s*Double Dragon.*", "", title, flags=re.I).strip()
    handle = p["handle"]
    fmt = "100ml" if ("100" in handle or "100 ml" in title.lower()) else "50ml"
    aromas = FLAVORS.get(handle)
    if not aromas:
        # try to infer from product tags / body
        aromas = ""
    out.append(
        {
            "officialName": name,
            "title": title,
            "handle": handle,
            "url": f"https://biarritz-lab.com/products/{handle}",
            "image": img,
            "priceOfficialEuros": float(v["price"]),
            "available": v.get("available"),
            "description": body,
            "aromas": aromas,
            "format": fmt,
            "nicotineMg": 0,
            "nicotineLabel": "0 mg / Sans nicotine",
            "pgVg": "50/50",
            "origin": "France",
            "bottle": "P.E.T",
            "composition": "Propylène glycol, Glycérine végétale, Arômes",
        }
    )

path = Path("data/rebuild/double-dragon-official.json")
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
print("wrote", len(out), "->", path)
for o in out:
    print(f"- {o['officialName']} | {o['aromas']} | {o['format']} | {o['handle']} | {o['priceOfficialEuros']}")
