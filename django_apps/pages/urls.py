from django.urls import path
from . import views

app_name = 'pages' 
urlpatterns = [
    # Informative pages
    path("", views.home, name="home"),
    path("about/", views.about, name="about"),
    path("news/", views.about, name="news"),
    path("resources/", views.about, name="resources"),
    path("privacy/", views.about, name="privacy"),
    path("contact/", views.about, name="contact"),
    # Solid connection and orientation pages
    path("hello/", views.hello, name="hello"),
    path("connect/", views.connect, name="connect"),
    path("orientation/<int:step>/", views.orientation, name="orientation"),
    path("create/", views.create, name="create"),
    # Learning (Main App)
    path("learn/", views.learn, name="learn"),
    path(
        "lesson/<str:lesson_id>/", views.lesson, name="lesson"
    ),  # Page for test code. Will be deleted
]
