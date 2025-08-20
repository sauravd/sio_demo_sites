from django.db import models

class Site(models.Model):
    id = models.IntegerField(primary_key=True)  # from Excel "No"
    farmer_name = models.CharField(max_length=255)
    region = models.CharField(max_length=100)
    governorate = models.CharField(max_length=100)
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    crop_type = models.CharField(max_length=150, blank=True)
    water_source = models.CharField(max_length=150, blank=True)
    irrigation_system_type = models.CharField(max_length=150, blank=True)
    distribution_uniformity_pct = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    description = models.TextField(blank=True)
    farmer_name_ar = models.CharField(max_length=255, blank=True, null=True)
    region_ar = models.CharField(max_length=255, blank=True, null=True)
    governorate_ar = models.CharField(max_length=255, blank=True, null=True)
    crop_type_ar = models.CharField(max_length=255, blank=True, null=True)
    water_source_ar = models.CharField(max_length=255, blank=True, null=True)
    irrigation_system_type_ar = models.CharField(max_length=255, blank=True, null=True)
    description_ar = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.id} - {self.farmer_name}"

class SiteImage(models.Model):
    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name="images")
    image = models.ImageField(upload_to="photos/%Y/%m/%d/")  # we’ll control placement in importer
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]
