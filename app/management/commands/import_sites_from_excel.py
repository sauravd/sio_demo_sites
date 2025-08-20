import re
import shutil
from pathlib import Path
from decimal import Decimal, InvalidOperation

import pandas as pd
from slugify import slugify

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from app.models import Site, SiteImage

AR_RE = re.compile(r"[\u0600-\u06FF]")  # Arabic Unicode range


# ----------------- small helpers -----------------

def natural_key(p: Path):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r'(\d+)', p.name)]

def safe_int(x):
    try:
        s = str(x).strip()
        return int(s) if s and re.fullmatch(r"-?\d+", s) else None
    except Exception:
        return None

def safe_decimal(x):
    if x is None:
        return None
    try:
        s = str(x).strip().replace("%", "")
        if s == "" or s.lower() == "nan":
            return None
        return Decimal(s)
    except (InvalidOperation, AttributeError, ValueError):
        return None

def _maybe_swap_latlon(lat: Decimal | None, lon: Decimal | None):
    if lat is None or lon is None:
        return lat, lon
    try:
        if lat > Decimal("35") and lon < Decimal("30"):
            return lon, lat
    except Exception:
        pass
    return lat, lon

def _normalize_tokens(s: str):
    s = (s or "").lower()
    s = s.replace("eastren", "eastern")
    s = s.replace("strubarry", "strawberry")
    s = s.replace("aljandal", "al jandal")
    s = re.sub(r'^\s*\d+\s*[-_]\s*', '', s)
    s = re.sub(r'\bal\b', ' ', s)
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    return set(t for t in s.split() if t)

def _numeric_prefix(name: str):
    m = re.match(r'^\s*(\d+)\s*[-_]', name)
    return int(m.group(1)) if m else None

def _best_folder_for_site(region: str, governorate: str, images_base: Path, site_id: int):
    rt = _normalize_tokens(region)
    gt = _normalize_tokens(governorate)

    candidates = []
    for child in images_base.iterdir():
        if not child.is_dir():
            continue
        ftoks = _normalize_tokens(child.name)
        if rt.issubset(ftoks) and gt.issubset(ftoks):
            score = len((rt | gt).intersection(ftoks))
            candidates.append((child, score, _numeric_prefix(child.name)))

    if not candidates:
        return None

    exact = [c for c in candidates if c[2] == site_id]
    if exact:
        exact.sort(key=lambda x: (-x[1], x[0].name))
        return exact[0][0]

    candidates.sort(key=lambda x: (-x[1], x[0].name))
    return candidates[0][0]


# ----------------- header handling -----------------

def norm_header(s: str) -> str:
    s = (s or "").strip().lower()
    s = s.replace("\u00a0", " ")
    s = re.sub(r'[\(\)%\.:;/,]+', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s

# English aliases
COLUMN_ALIASES_NORM = {
    "id": ["no", "no.", "id"],
    "farmer_name": ["farmer name"],
    "region": ["region"],
    "governorate": ["governorate"],
    "longitude": ["longitude", "lon", "long"],
    "latitude": ["latitude", "lat"],
    "crop_type": ["crop type"],
    "water_source": ["water source"],
    "irrigation_system_type": ["irrigation system type"],
    "distribution_uniformity_pct": [
        "distribution uniformity",
        "distribution uniformity %",
        "irrigation efficiency distribution uniformity",
        "irrigation efficiency percent distribution uniformity",
        "irrigation effecincy percent distribution uniformity",
        "irrgation effecincy distribution uniformity",
    ],
    "number_of_trees": ["number of trees", "trees"],
    "area_m2": ["area m2", "area"],
    "description": ["intervention description", "description"],
}

REQUIRED_KEYS = {"id", "region", "governorate", "longitude", "latitude"}

# Keys that have Arabic companions
AR_KEYS = [
    "farmer_name",
    "region",
    "governorate",
    "crop_type",
    "water_source",
    "irrigation_system_type",
    "description",
]


def _build_column_map(columns: list[str]) -> dict:
    norm_to_actual = {norm_header(c): c for c in columns}
    result = {}
    for internal, norm_aliases in COLUMN_ALIASES_NORM.items():
        for alias in norm_aliases:
            if alias in norm_to_actual:
                result[internal] = norm_to_actual[alias]
                break
    return result

def _find_ar_neighbor_right(columns: list[str], en_col: str) -> str | None:
    try:
        i = columns.index(en_col)
    except ValueError:
        return None
    if i + 1 < len(columns):
        right = columns[i + 1]
        # Heuristics: Arabic script OR ends with (AR) / Arabic / عرب
        if AR_RE.search(right) or re.search(r"\b(\(ar\)|arabic|عرب|العربية)\b", right, re.I):
            return right
    return None

def _build_ar_map(columns: list[str], en_map: dict) -> dict:
    """
    Return dict like {'farmer_name_ar': actual_ar_col, ...}
    Strategy:
      1) If the column immediately to the right of EN looks Arabic or is marked (AR), take it.
      2) Otherwise, scan for headers containing Arabic script that look related (fallback: first Arabic header).
    """
    ar_map = {}
    # Pre-index Arabic-looking headers
    ar_headers = [c for c in columns if AR_RE.search(c)]

    for base in AR_KEYS:
        ar_key = f"{base}_ar"
        en_col = en_map.get(base)
        found = None

        # 1) neighbor to the right
        if en_col:
            found = _find_ar_neighbor_right(columns, en_col)

        # 2) fallback: use the first Arabic-looking header if nothing else
        if not found and ar_headers:
            # optionally could be smarter (e.g., fuzzy match), but usually sheets are well-structured
            found = ar_headers[0]

        ar_map[ar_key] = found  # may be None
    return ar_map

def _load_dataframe_robust(excel_path: Path, sheet: str) -> pd.DataFrame:
    df = pd.read_excel(excel_path, sheet_name=sheet, header=0).fillna("")
    cmap = _build_column_map(list(df.columns))
    if REQUIRED_KEYS.issubset(set(cmap.keys())):
        return df

    raw = pd.read_excel(excel_path, sheet_name=sheet, header=None).fillna("")
    if raw.shape[0] < 2:
        raise CommandError("Excel sheet too short to parse headers.")

    headers = raw.iloc[0].tolist()
    df2 = raw.iloc[1:].copy()
    df2.columns = headers
    cmap2 = _build_column_map(list(df2.columns))
    if REQUIRED_KEYS.issubset(set(cmap2.keys())):
        return df2

    missing = list(REQUIRED_KEYS - set(cmap2.keys()) - set(cmap.keys()))
    raise CommandError(
        f"Missing required columns after two parsing attempts: {missing}\n"
        f"Found columns (attempt1): {list(df.columns)}\n"
        f"Found columns (attempt2): {list(df2.columns)}"
    )


# ----------------- management command -----------------

class Command(BaseCommand):
    help = "Import sites from Excel and attach up to N images per site. Also ingests Arabic columns next to English."

    def add_arguments(self, parser):
        parser.add_argument("--excel", required=True, help="Path to Excel file")
        parser.add_argument("--images_base", required=True, help="Base directory containing image folders")
        parser.add_argument("--sheet", default="SIO", help="Sheet name (default: SIO)")
        parser.add_argument("--max_images", type=int, default=4, help="Max images per site (default: 4)")

    def handle(self, *args, **opts):
        excel_path = Path(opts["excel"]).expanduser().resolve()
        images_base = Path(opts["images_base"]).expanduser().resolve()
        sheet = opts["sheet"]
        max_images = opts["max_images"]

        if not excel_path.exists():
            raise CommandError(f"Excel not found: {excel_path}")
        if not images_base.exists():
            raise CommandError(f"Images base not found: {images_base}")

        df = _load_dataframe_robust(excel_path, sheet)
        columns = list(df.columns)
        en_map = _build_column_map(columns)      # internal EN -> actual header
        ar_map = _build_ar_map(columns, en_map)  # internal AR -> actual header

        # Convenience accessors
        def col_series(mapdict, key, default_none=True):
            if key in mapdict and mapdict[key] in df.columns:
                return df[mapdict[key]]
            return pd.Series([None] * len(df)) if default_none else pd.Series([])

        # Build normalized frame
        ndf = pd.DataFrame({
            "id": col_series(en_map, "id"),
            "farmer_name": col_series(en_map, "farmer_name"),
            "farmer_name_ar": col_series(ar_map, "farmer_name_ar"),
            "region": col_series(en_map, "region"),
            "region_ar": col_series(ar_map, "region_ar"),
            "governorate": col_series(en_map, "governorate"),
            "governorate_ar": col_series(ar_map, "governorate_ar"),
            "longitude": col_series(en_map, "longitude"),
            "latitude": col_series(en_map, "latitude"),
            "crop_type": col_series(en_map, "crop_type"),
            "crop_type_ar": col_series(ar_map, "crop_type_ar"),
            "water_source": col_series(en_map, "water_source"),
            "water_source_ar": col_series(ar_map, "water_source_ar"),
            "irrigation_system_type": col_series(en_map, "irrigation_system_type"),
            "irrigation_system_type_ar": col_series(ar_map, "irrigation_system_type_ar"),
            "distribution_uniformity_pct": col_series(en_map, "distribution_uniformity_pct"),
            "description": col_series(en_map, "description"),
            "description_ar": col_series(ar_map, "description_ar"),
            "number_of_trees": col_series(en_map, "number_of_trees"),
            "area_m2": col_series(en_map, "area_m2"),
        }).fillna("")

        # Type coercion
        ndf["id"] = ndf["id"].apply(safe_int)
        ndf["latitude"] = ndf["latitude"].apply(safe_decimal)
        ndf["longitude"] = ndf["longitude"].apply(safe_decimal)
        ndf["distribution_uniformity_pct"] = ndf["distribution_uniformity_pct"].apply(safe_decimal)

        # Auto swap obvious flips
        swapped = 0
        for idx in ndf.index:
            lat, lon = ndf.at[idx, "latitude"], ndf.at[idx, "longitude"]
            new_lat, new_lon = _maybe_swap_latlon(lat, lon)
            if (new_lat, new_lon) != (lat, lon):
                ndf.at[idx, "latitude"], ndf.at[idx, "longitude"] = new_lat, new_lon
                swapped += 1

        before = len(ndf)
        ndf = ndf.dropna(subset=["id", "latitude", "longitude"])
        dropped = before - len(ndf)

        self.stdout.write(self.style.NOTICE(
            f"Rows: {before}, dropped (missing id/coords): {dropped}, auto-swapped lat/lon: {swapped}"
        ))

        created, updated, with_images, without_images = 0, 0, 0, 0

        for _, row in ndf.iterrows():
            sid = int(row["id"])
            def S(key):  # tidy string
                return str(row.get(key) or "").strip()

            region = S("region")
            governorate = S("governorate")

            defaults = {
                "farmer_name": S("farmer_name"),
                "farmer_name_ar": S("farmer_name_ar") or None,
                "region": region,
                "region_ar": S("region_ar") or None,
                "governorate": governorate,
                "governorate_ar": S("governorate_ar") or None,
                "latitude": row["latitude"],
                "longitude": row["longitude"],
                "crop_type": S("crop_type"),
                "crop_type_ar": S("crop_type_ar") or None,
                "water_source": S("water_source"),
                "water_source_ar": S("water_source_ar") or None,
                "irrigation_system_type": S("irrigation_system_type"),
                "irrigation_system_type_ar": S("irrigation_system_type_ar") or None,
                "distribution_uniformity_pct": row.get("distribution_uniformity_pct"),
                "description": S("description"),
                "description_ar": S("description_ar") or None,
            }

            obj, is_created = Site.objects.update_or_create(id=sid, defaults=defaults)
            created += 1 if is_created else 0
            updated += 0 if is_created else 1

            # Reset images for idempotency
            SiteImage.objects.filter(site=obj).delete()

            # Find best matching folder for images
            folder = _best_folder_for_site(region, governorate, images_base, sid)
            if folder and folder.exists():
                folder_slug = slugify(f"{region}_{governorate}", separator="_")
                media_dir = Path(settings.MEDIA_ROOT) / "photos" / folder_slug
                media_dir.mkdir(parents=True, exist_ok=True)

                files = [p for p in folder.iterdir()
                         if p.is_file() and p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp")]
                files.sort(key=natural_key)
                files = files[:max_images]

                for idx2, src in enumerate(files):
                    dest = media_dir / f"{sid}_{idx2+1}{src.suffix.lower()}"
                    try:
                        shutil.copy2(src, dest)
                    except Exception as e:
                        self.stdout.write(self.style.WARNING(f"Failed to copy '{src}' -> '{dest}': {e}"))
                        continue

                    rel_path = dest.relative_to(settings.MEDIA_ROOT)
                    si = SiteImage(site=obj, sort_order=idx2)
                    si.image.name = str(rel_path)
                    si.save()

                if files:
                    with_images += 1
                    self.stdout.write(self.style.SUCCESS(
                        f"Site {sid}: attached {len(files)} image(s) from '{folder.name}'"
                    ))
                else:
                    without_images += 1
                    self.stdout.write(self.style.WARNING(
                        f"Site {sid}: folder matched '{folder.name}' but contains no supported images"
                    ))
            else:
                without_images += 1
                self.stdout.write(self.style.WARNING(
                    f"Site {sid}: no matching image folder for {region} / {governorate}"
                ))

        self.stdout.write(self.style.SUCCESS(
            f"Done. Created: {created}, Updated: {updated}, With images: {with_images}, Without images: {without_images}"
        ))
