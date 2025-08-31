# django_apps/views/views.py

from django.shortcuts import render
from django.http import HttpResponse

def home(request):
    """Main education platform page"""
    return render(request, 'views/home.html', {'page_mode': 'information'})

def lesson(request, lesson_id):
    """Individual lesson page"""
    context = {
        'lesson_id': lesson_id,
        'page_mode': 'learning'
    }
    return render(request, 'views/lesson.html', context)

def about(request):
    return render(request, 'views/about.html', {'page_mode': 'information'})

def hello(request):
    return render(request, 'views/hello.html', {'page_mode': 'auth'})

def connect(request):
    return render(request, 'views/connect.html', {'page_mode': 'auth'})

def orientation(request, step):
    return render(request, 'views/orientation.html', {
        'page_mode': 'onboarding',
        'step': step,
        'max_steps': 5
    })

def create(request):
    return render(request, 'views/create.html', {'page_mode': 'auth'})

def learn(request):
    return render(request, 'views/learn.html', {'page_mode': 'learning'})

# Add any other missing views that are referenced in your urls.py
def contact(request):
    return render(request, 'views/contact.html', {'page_mode': 'information'})

def privacy(request):
    return render(request, 'views/privacy.html', {'page_mode': 'information'})

def news(request):
    return render(request, 'views/news.html', {'page_mode': 'information'})

def resources(request):
    return render(request, 'views/resources.html', {'page_mode': 'information'})

def contribute(request):
    return render(request, 'views/contribute.html', {'page_mode': 'information'})