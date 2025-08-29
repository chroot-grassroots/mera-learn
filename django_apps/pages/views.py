from django.shortcuts import render
from django.http import HttpResponse

def home(request):
    """Main education platform page"""
    return render(request, 'lessons/home.html')

def lesson(request, lesson_id):
    """Individual lesson page"""
    context = {
        'lesson_id': lesson_id,
        # We'll add lesson data here later
    }
    return render(request, 'lessons/lesson.html', context)

def about(request):
    return HttpResponse("About page - coming soon!")

def hello(request):
    return HttpResponse("Hello page - coming soon!")

def connect(request):
    return HttpResponse("Connect page - coming soon!")

def orientation(request, step):
    return HttpResponse(f"Orientation step {step} - coming soon!")

def create(request):
    return HttpResponse("Create page - coming soon!")

def learn(request):
    return HttpResponse("Learn page - coming soon!")