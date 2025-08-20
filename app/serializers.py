from rest_framework import serializers
from .models import Site, SiteImage

class SiteImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = SiteImage
        fields = ["image", "sort_order"]

class SiteGeoJSONSerializer(serializers.ModelSerializer):
    images = SiteImageSerializer(many=True, read_only=True)

    class Meta:
        model = Site
        fields = [
            "id",
            # names
            "farmer_name", "farmer_name_ar",
            # admin
            "region", "region_ar", "governorate", "governorate_ar",
            # coords
            "latitude", "longitude",
            # attributes
            "crop_type", "crop_type_ar",
            "water_source", "water_source_ar",
            "irrigation_system_type", "irrigation_system_type_ar",
            "distribution_uniformity_pct",
            "description", "description_ar",
            "images",
        ]

    def to_representation(self, instance):
        props = super().to_representation(instance)
        # coordinates
        lon = float(props.pop("longitude"))
        lat = float(props.pop("latitude"))
        # absolute URLs for images
        request = self.context.get("request")
        for img in props.get("images", []):
            if request:
                img["image"] = request.build_absolute_uri(img["image"])
        return {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": props,
        }
