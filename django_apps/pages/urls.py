from django.urls import path
from . import views

app_name = 'pages' 
urlpatterns = [
    # Informative pages
    path("", views.home, name="home"),
    path("about/", views.about, name="about"),
    path("news/", views.news, name="news"),
    path("resources/", views.resources, name="resources"),
    path("privacy/", views.privacy, name="privacy"),
    path("contact/", views.contact, name="contact"),
    path("contribute/", views.contribute, name="contribute"),
    # Solid connection and orientation pages
    path("hello/", views.hello, name="hello"),
    path("connect/", views.connect, name="connect"),
    path("orientation/<int:step>/", views.orientation, name="orientation"),
    path("create/", views.create, name="create"),
    # Learning (Main App)
    path("solid/", views.solid, name="solid"),
    path("learn/", views.learn, name="learn"),
]

