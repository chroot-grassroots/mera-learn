# django_apps/pages/views.py

from django.shortcuts import render
from django.http import HttpResponse

def home(request):
    """Main education platform page"""
    return render(request, 'pages/home.html', {'page_mode': 'information'})

def lesson(request, lesson_id):
    """Individual lesson page"""
    context = {
        'lesson_id': lesson_id,
        'page_mode': 'learning'
    }
    return render(request, 'pages/lesson.html', context)

def about(request):
    return render(request, 'pages/about.html', {'page_mode': 'information'})

def hello(request):
    return render(request, 'pages/hello.html', {'page_mode': 'auth'})

def connect(request):
    return render(request, 'pages/connect.html', {'page_mode': 'auth'})

def orientation(request, step):
    return render(request, 'pages/orientation.html', {
        'page_mode': 'onboarding',
        'step': step,
        'max_steps': 5
    })

def create(request):
    return render(request, 'pages/create.html', {'page_mode': 'auth'})

def learn(request):
    return render(request, 'pages/learn.html', {'page_mode': 'learning'})

# Add any other missing views that are referenced in your urls.py
def contact(request):
    return render(request, 'pages/contact.html', {'page_mode': 'information'})

def privacy(request):
    return render(request, 'pages/privacy.html', {'page_mode': 'information'})

def news(request):
    return render(request, 'pages/news.html', {'page_mode': 'information'})

def resources(request):
    return render(request, 'pages/resources.html', {'page_mode': 'information'})

def contribute(request):
    return render(request, 'pages/contribute.html', {'page_mode': 'information'})