
SIO Demo Sites — README
=======================

A small Django + Leaflet app that visualizes Saudi Irrigation Organization (SIO) demo sites on a map, with bilingual (EN/AR) UI, image galleries, and filters.

--------------------------------------------------------------------------------
1) Tech stack
--------------------------------------------------------------------------------
- Python 3.12+, Django 5, Django REST Framework
- Leaflet (client map)
- Pandas (Excel import)
- Pillow (image handling)
- slugify (safe folder names)
- SQLite (local dev)

Repo layout (key dirs/files)
----------------------------
sio_demo_sites/
├─ manage.py
├─ siofieldmap/                # Project settings/urls/wsgi
│  ├─ settings.py
│  ├─ urls.py
│  └─ wsgi.py
├─ app/                        # Main app
│  ├─ models.py                # Site, SiteImage
│  ├─ serializers.py           # SiteGeoJSONSerializer
│  ├─ views.py                 # home, SitesGeoJSON API
│  ├─ urls.py                  # '' (home), 'api/sites/'
│  ├─ templates/app/index.html # HTML + i18n + filters
│  ├─ static/app/app.css       # Styles
│  └─ static/app/app.js        # Map + filters + lightbox
└─ locale/
   └─ ar/LC_MESSAGES/django.po/.mo  # Arabic translations

--------------------------------------------------------------------------------
2) Requirements
--------------------------------------------------------------------------------
- Python 3.12+
- pip, venv
- (Linux) build essentials for Pillow: libjpeg, zlib, etc.

Ubuntu/Debian system deps (example):
  sudo apt update
  sudo apt install -y build-essential libjpeg-dev zlib1g-dev libfreetype6-dev

--------------------------------------------------------------------------------
3) Local setup (first time)
--------------------------------------------------------------------------------
# 3.1 Clone the repo
git clone https://github.com/<your-username>/sio_demo_sites.git
cd sio_demo_sites

# 3.2 Create & activate virtualenv
python3 -m venv .venv
source .venv/bin/activate      # (Windows) .venv\Scripts\activate

# 3.3 Install Python deps
pip install --upgrade pip
pip install -r requirements.txt

# 3.4 Database migrations
python manage.py migrate

# 3.5 (Optional) Create admin user
python manage.py createsuperuser

--------------------------------------------------------------------------------
4) Importing data & images from Excel
--------------------------------------------------------------------------------
Place your Excel file and image folders somewhere on disk. The importer expects
a sheet (default: "SIO") with columns like:
- No / ID, Region, Governorate, Latitude, Longitude (required)
- Farmer Name, Crop Type, Water Source, Irrigation System Type
- Distribution Uniformity (%), Intervention Description
- Arabic columns (optional): Farmer Name (AR), Region (AR), Governorate (AR),
  Crop Type (AR), Water Source (AR), Irrigation System Type (AR),
  Intervention Description (AR)

The command auto-maps several header variants and handles some typos.
It also tries to find a best-matching image folder per site based on
Region+Governorate tokens.

Run the importer (example paths):
python manage.py import_sites_from_excel \
  --excel "/absolute/path/Copy of SIO - Demo Sites_V2_V3_V4.xlsx" \
  --images_base "/absolute/path/image-base-folder" \
  --sheet "SIO" \
  --max_images 4

Output will report created/updated sites and how many images were attached.
Images are copied into MEDIA_ROOT/photos/<region_governorate_slug> and exposed
via /media/…

Quick verifications:
- API:   curl -s http://127.0.0.1:8081/api/sites/ | jq .type
- Media: open a JSON feature and check properties.images[].image are absolute URLs

--------------------------------------------------------------------------------
5) Run the app locally
--------------------------------------------------------------------------------
# Default: 127.0.0.1:8000
python manage.py runserver

# Custom port (as used in our examples):
python manage.py runserver 0.0.0.0:8081

Visit: http://127.0.0.1:8081/

--------------------------------------------------------------------------------
6) Internationalization (i18n)
--------------------------------------------------------------------------------
The app is bilingual. The HTML <html lang="…"> drives client behavior;
Django’s set_language view persists the language in a cookie.

6.1 Extract strings (only needed when you change templates/text)
python manage.py makemessages -l ar

6.2 Edit translations
Open locale/ar/LC_MESSAGES/django.po and translate msgstr entries.
- Include UI labels (“SIO Demo Sites Map”, “Region”, “Clear”, etc.).
- Right-to-left layout is automatic via dir="rtl" in index.html when Arabic is active.

6.3 Compile messages
python manage.py compilemessages

6.4 Test
Switch language using the dropdown (top-right). English is default; Arabic
persists after switching back and forth.

Notes
-----
- Dropdown option lists (filters) are localized on the client: values remain the
  English canonical keys for accurate filtering; labels swap to Arabic when Arabic UI is active.
- Popups switch field values (Farmer Name, Region, …, Description) to their Arabic
  counterparts when provided by the API (…_ar fields). If null, it falls back to English.

--------------------------------------------------------------------------------
7) Static & media files (dev)
--------------------------------------------------------------------------------
- Static: /static/app/app.css and /static/app/app.js are served in DEBUG.
- Leaflet CSS is loaded from CDN.
- Media (uploaded/copied images) served at /media/ (DEBUG=True).

If DEBUG=False (production), configure STATIC_ROOT, MEDIA_ROOT, and a web server
(or WhiteNoise) accordingly and run:
python manage.py collectstatic

--------------------------------------------------------------------------------
8) Troubleshooting
--------------------------------------------------------------------------------
• “/api/sites/ shows _ar fields null”
  → Re-run importer with the updated Excel that has Arabic columns. Confirm headers.
    The importer prints the mapping and count of rows processed.

• “Map loads but no markers”
  → Check /api/sites/ in your browser or curl. Ensure lat/lon are present.
    The importer will auto-swap coords if they look flipped.

• “Language selector doesn’t stick”
  → Ensure you’re using Django’s {% url 'set_language' %}, include {% csrf_token %},
    and your browser accepts cookies. The template already sets a hidden “next” input.

• “Images don’t appear in popups”
  → Confirm that images were copied to MEDIA_ROOT/photos/... and that
    properties.images[].image in /api/sites/ are absolute URLs.

• JS console error “b.intersection is not a function”
  → Fixed. app.js now checks bounds safely and fits within KSA_BOUNDS.

--------------------------------------------------------------------------------
9) Git workflow — committing & pushing
--------------------------------------------------------------------------------
# First time only (replace with your GitHub username)
git remote add origin git@github.com:<your-username>/sio_demo_sites.git

# Normal cycle
git add -A
git commit -m "Your message"
git pull --rebase origin main   # integrate remote changes
git push origin main

# Set upstream if needed
git push -u origin main

# Create a branch for a feature
git checkout -b feature/i18n-tweaks
# ... work, commit ...
git push -u origin feature/i18n-tweaks
# Open PR on GitHub

--------------------------------------------------------------------------------
10) Environment variables (optional)
--------------------------------------------------------------------------------
DEBUG=True                         # default for dev
TIME_ZONE=Asia/Riyadh
LANGUAGE_CODE=en-us
ALLOWED_HOSTS=127.0.0.1,localhost

If you change settings.py to read env vars, export them before runserver.

--------------------------------------------------------------------------------
11) Packaging later (Docker, optional pointer)
--------------------------------------------------------------------------------
Once the local version is finalized, you can build a container:
- Add a Dockerfile/entrypoint, pin Python base image
- Install requirements
- Run collectstatic
- Copy project and media (if needed) into the image or mount a volume
- Use gunicorn and serve static via WhiteNoise or reverse proxy

(We’ll produce a dedicated Docker README when you’re ready.)

--------------------------------------------------------------------------------
12) Useful URLs
--------------------------------------------------------------------------------
/                       → main page (Leaflet map)
/api/sites/             → GeoJSON FeatureCollection
/i18n/setlang/          → language switch (POST)
/admin/                 → Django admin (if superuser created)
/media/...              → images copied by importer in dev
