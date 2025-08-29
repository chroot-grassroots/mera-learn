from django.apps import AppConfig


class PagesConfig(AppConfig):  # ← Change class name
    default_auto_field = "django.db.models.BigAutoField"  
    name = "django_apps.pages"  # ← Change the name to match new path
