"""
Download the icons Vao2 uses into frontend/global/vendor/, once.

Icon libraries kept in the repository, so the interface works with no network
and no CDN:

    Meteocons  coloured weather icons (sun, clouds, rain...)       MIT
    Phosphor   interface icons, painted with the text colour      MIT
    Clothing   one accurate icon per garment, from Lucide / Lucide Lab (ISC),
               with IconPark and MingCute (Apache 2.0) where Lucide has none

Only the icons listed below are downloaded. Run again after adding one:

    .venv/Scripts/python.exe scripts/vendor_icons.py

Adapted from _beta's scripts/vendor_weather_icons.py.
"""

#/////////////////////////////////////////////////////////
# IMPORTS ////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
import json
import re
from pathlib import Path

import httpx


ROOT = Path(__file__).resolve().parent.parent
VENDOR = ROOT / "frontend" / "global" / "vendor"

METEOCONS = "https://cdn.jsdelivr.net/npm/@bybas/weather-icons@2.0.0"
PHOSPHOR = "https://cdn.jsdelivr.net/npm/@phosphor-icons/core@2.1.1"

METEOCONS_ICONS = [
    "clear-day", "clear-night", "partly-cloudy-day", "partly-cloudy-night",
    "overcast", "fog", "drizzle", "rain", "sleet", "snow", "hail",
    "thunderstorms-rain",
    "partly-cloudy-day-drizzle", "partly-cloudy-night-drizzle",
    "partly-cloudy-day-rain", "partly-cloudy-night-rain",
]

PHOSPHOR_ICONS = [
    # sidebar
    "house", "plus-circle", "cloud-sun", "youtube-logo", "newspaper",
    # theme button
    "sun", "moon",
    # video player
    "play", "pause", "speaker-high", "speaker-x",
    # weather readings
    "leaf", "drop", "wind", "eye", "gauge", "drop-half", "sun-dim", "cloud",
    # AI panel and weather assistant
    "sparkle", "arrow-up", "stop", "arrow-square-out",
]

# Garment (as sent by backend/platforms/weather_outfit.py) -> Iconify id.
CLOTHING = {
    "tshirt": "lucide-lab:shirt-t",
    "longsleeve": "lucide-lab:shirt-long-sleeve",
    "thermal": "lucide-lab:shirt-long-sleeve",
    "sweater": "lucide-lab:sweater",
    "jacket": "lucide-lab:jacket",
    "coat": "icon-park-outline:women-coat",
    "raincoat": "icon-park-outline:clothes-windbreaker",
    "trousers": "lucide-lab:trousers",
    "shorts": "lucide-lab:shorts",
    "sneakers": "lucide-lab:sneaker",
    "boots": "icon-park-outline:boots",
    "beanie": "lucide-lab:hat-beanie",
    "cap": "lucide-lab:hat-baseball",
    "scarf": "lucide-lab:scarf",
    "gloves": "mingcute:glove-line",
    "sunglasses": "lucide-lab:glasses-sun",
    "sunscreen": "lucide:tube-lotion",
    "mask": "mingcute:face-mask-line",
    "umbrella": "lucide:umbrella",
    "water": "lucide-lab:bottle-plastic",
}

ICONIFY = "https://api.iconify.design"

CLOTHING_LICENSES = {
    "lucide": "https://raw.githubusercontent.com/lucide-icons/lucide/main/LICENSE",
    "lucide-lab": "https://raw.githubusercontent.com/lucide-icons/lucide-lab/main/LICENSE",
    "icon-park-outline": "https://raw.githubusercontent.com/bytedance/IconPark/master/LICENSE",
    "mingcute": "https://raw.githubusercontent.com/Richard9394/MingCute/main/LICENSE",
}

SVG_BODY = re.compile(r"<svg[^>]*>(.*)</svg>", re.DOTALL)
ANIMATION = re.compile(r"<animate(?:Transform)?[^>]*?/>|<animate(?:Transform)?[^>]*>.*?</animate(?:Transform)?>", re.DOTALL)


#/////////////////////////////////////////////////////////
# DOWNLOAD ///////////////////////////////////////////////
#/////////////////////////////////////////////////////////
def fetch(url):
    response = httpx.get(url, timeout=40)
    response.raise_for_status()
    return response.text


def svg_body(markup):
    """What is inside <svg>...</svg>, without animations."""
    body = SVG_BODY.search(markup).group(1)
    body = ANIMATION.sub("", body)
    return " ".join(body.split())


def namespaced_ids(body, name):
    """
    Give an icon's gradient ids a unique prefix.

    Meteocons names its gradients "a", "b"... inside every file; two different
    icons on one page would otherwise paint with each other's gradients.
    """
    prefix = "mc_" + re.sub(r"[^a-z0-9]+", "_", name)

    ids = sorted(set(re.findall(r'id="([^"]+)"', body)), key=len, reverse=True)
    for local_id in ids:
        body = body.replace(f'id="{local_id}"', f'id="{prefix}_{local_id}"')
        body = body.replace(f"url(#{local_id})", f"url(#{prefix}_{local_id})")

    return body


#/////////////////////////////////////////////////////////
# OUTPUT /////////////////////////////////////////////////
#/////////////////////////////////////////////////////////
def write_module(filename, icons, header):
    lines = [header, "export default {"]
    for name in sorted(icons):
        lines.append(f"  {json.dumps(name)}: {json.dumps(icons[name])},")
    lines.append("};\n")

    (VENDOR / filename).write_text("\n".join(lines), encoding="utf-8")
    print(f"{filename}: {len(icons)} icons")


def main():
    VENDOR.mkdir(parents=True, exist_ok=True)

    meteocons = {}
    for name in METEOCONS_ICONS:
        body = svg_body(fetch(f"{METEOCONS}/production/fill/all/{name}.svg"))
        meteocons[name] = namespaced_ids(body, name)

    phosphor = {}
    for name in PHOSPHOR_ICONS:
        phosphor[name] = svg_body(fetch(f"{PHOSPHOR}/assets/regular/{name}.svg"))

    # Whole <svg> elements: each library has its own grid and stroke settings.
    clothing = {}
    for garment, icon_id in CLOTHING.items():
        prefix, name = icon_id.split(":")
        markup = fetch(f"{ICONIFY}/{prefix}/{name}.svg")
        clothing[garment] = " ".join(markup.split())

    write_module(
        "clothing.js",
        clothing,
        "/* Clothing icons from Lucide / Lucide Lab (ISC), IconPark and MingCute (Apache 2.0). "
        "See clothing-LICENSES. Generated by scripts/vendor_icons.py. */",
    )

    licences = []
    for prefix, url in CLOTHING_LICENSES.items():
        licences.append(f"===== {prefix} ({url}) =====\n\n{fetch(url).strip()}\n")
    (VENDOR / "clothing-LICENSES").write_text("\n".join(licences), encoding="utf-8")

    write_module(
        "meteocons.js",
        meteocons,
        "/* Meteocons 2.0.0, MIT (see meteocons-LICENSE). Generated by scripts/vendor_icons.py. */",
    )
    write_module(
        "phosphor.js",
        phosphor,
        "/* Phosphor Icons 2.1.1, regular weight, MIT (see phosphor-LICENSE). Generated by scripts/vendor_icons.py. */",
    )

    for url, filename in (
        (f"{METEOCONS}/LICENSE", "meteocons-LICENSE"),
        (f"{PHOSPHOR}/LICENSE", "phosphor-LICENSE"),
    ):
        (VENDOR / filename).write_text(fetch(url).replace("\r\n", "\n"), encoding="utf-8")


if __name__ == "__main__":
    main()
