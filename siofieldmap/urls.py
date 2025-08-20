from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.views.i18n import set_language

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", include("app.urls")),
    path("i18n/setlang/", set_language, name="set_language"),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
