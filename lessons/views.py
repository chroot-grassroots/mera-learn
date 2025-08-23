from django.shortcuts import render

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