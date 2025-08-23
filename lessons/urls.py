from django.urls import path
from . import views

app_name = 'lessons'
urlpatterns = [
    path('', views.home, name='home'),
    path('lesson/<str:lesson_id>/', views.lesson, name='lesson'),
]