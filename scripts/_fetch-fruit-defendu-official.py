import html
import json
import re
import urllib.request
from pathlib import Path

UA = "AllVapsCatalogBot/1.0 (fruit-defendu; contact@allvaps.local)"
url = "https://biarritz-lab.com/collections/le-fruit-defendu/products.json?limit=50"
req = urllib.request.Request(url, headers={"User-Agent": UA})
with urllib.request.urlopen(req, timeout=30) as r:
    data = json.load(r)

# Flavors from official collection page cards
FLAVORS = {
    "erotic-dream-le-fruit-defendu-50-ml-00-mg": "Limonade - Pomme - Mûre - Frais",
    "fraise-damour-le-fruit-defendu-50-ml-00-mg": "Fraise - Frais",
    "ghost-riders-le-fruit-defendu-50-ml-00-mg": "Pastèque - Fraise - Frais",
    "loving-memory-le-fruit-defendu-50-ml-00-mg": "Cassis - Cerise - Violette - Frais",
    "mango-fresh-killah-le-fruit-defendu-50-ml-00-mg": "Mangue - Frais",
    "myrtillissime-le-fruit-defendu-50-ml-00-mg": "Myrtille - Frais",
    "peach-sex-sun-le-fruit-defendu-50-ml-00-mg": "Pêche - Grenadine - Frais",
    "satanananas-le-fruit-defendu-50-ml-00-mg": "Fruit du dragon - Ananas - Frais",
    "les-demons-de-jesus-le-fruit-defendu-50-ml-00-mg": "Melon - Abricot - Pêche",
}

out = []
for p in data["products"]:
    v = p["variants"][0]
    img = (p.get("images") or [{}])[0].get("src")
    body = re.sub("<[^>]+>", " ", p.get("body_html") or "")
    body = html.unescape(re.sub(r"\s+", " ", body)).strip()
    title = p["title"]
    name = re.sub(r"\s*-\s*Le Fruit.*", "", title, flags=re.I).strip()
    handle = p["handle"]
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
            "aromas": FLAVORS.get(handle),
            "format": "50ml",
            "nicotineMg": 0,
            "nicotineLabel": "0 mg / Sans nicotine",
            "pgVg": "50/50",
            "origin": "France",
            "bottle": "P.E.T",
            "composition": "Propylène glycol, Glycérine végétale, Arômes",
        }
    )

path = Path("data/rebuild/fruit-defendu-official.json")
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
print("wrote", len(out), "->", path)
for o in out:
    print(f"- {o['officialName']} | {o['aromas']} | {o['handle']}")
