from django.urls import path
from .views import home, SitesGeoJSON

urlpatterns = [
    path("", home, name="home"),
    path("api/sites/", SitesGeoJSON.as_view(), name="sites-geojson"),
]
