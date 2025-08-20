SIO Demo Sites — Quick Start (User Guide)
==========================================

This guide is for *using* the SIO Demo Sites web app locally on your computer. 
It covers setup, importing demo data (sites + photos), running the app, and basic use.
You do **not** need to change backend code to follow this.

What you get
------------
• Interactive map of Saudi Arabia showing demo farm sites  
• Filters (Region, Governorate, Crop Type, Water Source, Irrigation System Type, Farmer Name)  
• Pop‑ups with site details and photos (click any thumbnail to view larger, with next/prev)  
• Language switcher: English ⇄ العربية (right‑to‑left layout in Arabic)

Requirements
------------
• Python 3.10+ (3.11/3.12 recommended)  
• pip (comes with Python)  
• A modern browser (Chrome, Edge, Firefox, Safari)  
• Optional: An Excel file of sites and a folder of images to showcase

1) Get the project
------------------
Option A — Clone from GitHub (recommended):
    git clone https://github.com/sauravd/sio_demo_sites.git
    cd sio_demo_sites

Option B — Download ZIP:
    1) Visit: https://github.com/sauravd/sio_demo_sites
    2) Click “Code” → “Download ZIP”
    3) Unzip and open the folder in your terminal

2) Setup (first time)
---------------------
Create and activate a virtual environment, then install dependencies.

macOS/Linux:
    python3 -m venv .venv
    source .venv/bin/activate
    pip install --upgrade pip
    pip install -r requirements.txt

Windows (PowerShell):
    py -m venv .venv
    .venv\Scripts\Activate.ps1
    python -m pip install --upgrade pip
    pip install -r requirements.txt

Initialize the database:
    python manage.py migrate

3) (Optional but recommended) Import demo sites + photos
-------------------------------------------------------
If you have the Excel and the images folder, import them.  
The importer is robust to small header variations and will copy a few photos per site into the app’s media folder.

Example:
    python manage.py import_sites_from_excel \
      --excel "/path/to/Copy of SIO - Demo Sites_V2_V3_V4.xlsx" \
      --images_base "/path/to/folder/with/site-image-subfolders"

Notes:
• The importer matches folders to sites using Region/Governorate names (e.g., “1- Asir Abha”).  
• It also copies up to 4 images per site into MEDIA_ROOT/photos for reliable serving.

4) Run the app
--------------
Start the development server:
    python manage.py runserver 0.0.0.0:8081

Open your browser:
    http://localhost:8081/

5) Using the app
----------------
• Header: shows the title and logos, plus a language selector.  
• Filters: pick Region, Governorate, Crop Type, Water Source, Irrigation System Type; type a Farmer Name to search.  
• Clear: resets all filters and the search box.  
• Map: drag to pan, scroll/± to zoom (map stays within Saudi Arabia).  
• Pop‑ups: click a marker → see details and thumbnail photos; click any thumbnail to open the lightbox (next/prev/close).  
• Arabic UI: when selected, the layout becomes right‑to‑left and fields display Arabic text where available.

6) Language switching
---------------------
• Default is English. Use the header selector to switch to العربية.  
• When Arabic is active, the app uses Arabic columns from the dataset (e.g., Region_Ar, Crop_Type_Ar, Description_Ar).  
• If Arabic data isn’t present for a field, the app will show the English value as a fallback.

7) Troubleshooting
------------------
• “Server Error (500)” on the homepage?
  – In the terminal, look for errors printed after the request.  
  – Run: python manage.py check

• Blank map / no markers?
  – Open http://localhost:8081/api/sites/ in your browser. You should see JSON with “features”.  
  – If it’s empty or errors, re-run the import with the correct --excel and --images_base paths.

• Images don’t open or show 404?
  – Ensure the importer copied images to MEDIA_ROOT (default: ./media) and that MEDIA_URL is /media/ (default).  
  – During development, Django serves media automatically when DEBUG=True (default).

• Language switch doesn’t “stick”?
  – Your browser must accept cookies. The setting is stored in a cookie.  
  – Try refreshing after switching; if issues persist, clear site cookies for localhost.

That’s it! Open the app, filter, and explore.
