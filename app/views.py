# app/views.py
from django.db.models import Prefetch
from rest_framework.views import APIView
from rest_framework.response import Response
from django.shortcuts import render

from .models import Site, SiteImage
from .serializers import SiteGeoJSONSerializer


def home(request):
    return render(request, "app/index.html", {})


class SitesGeoJSON(APIView):
    authentication_classes = []  # public read
    permission_classes = []

    def get(self, request):
        # Order images once in the DB and prefetch them onto each Site
        images_qs = (
            SiteImage.objects
            .only("id", "site_id", "image", "sort_order")
            .order_by("sort_order", "id")
        )

        qs = (
            Site.objects
            .all()
            .prefetch_related(Prefetch("images", queryset=images_qs))
        )

        serializer = SiteGeoJSONSerializer(qs, many=True, context={"request": request})
        return Response({"type": "FeatureCollection", "features": serializer.data})
