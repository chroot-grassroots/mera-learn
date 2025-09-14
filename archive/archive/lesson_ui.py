"""
UI components for displaying lessons.
"""
from pyscript import document

def render_text_block(block, container_id):
    """Render a text content block."""
    container = document.querySelector(f"#{container_id}")
    
    html = f'''
    <div class="bg-white rounded-lg p-6 mb-4 shadow-sm">
        <h3 class="text-xl font-bold mb-3">{block['title']}</h3>
        <p class="text-gray-700 leading-relaxed">{block['content']}</p>
    </div>
    '''
    
    container.innerHTML = html

def render_quiz_block(block, container_id, answer_callback=None):
    """Render a quiz content block."""
    container = document.querySelector(f"#{container_id}")
    
    options_html = ""
    for i, option in enumerate(block['options']):
        options_html += f'''
        <button class="quiz-option block w-full text-left p-3 mb-2 bg-gray-100 hover:bg-blue-100 rounded border" 
                onclick="handle_quiz_answer({i})">
            {chr(65 + i)}. {option}
        </button>
        '''
    
    html = f'''
    <div class="bg-white rounded-lg p-6 mb-4 shadow-sm">
        <h3 class="text-xl font-bold mb-3">{block['title']}</h3>
        <p class="text-gray-700 mb-4">{block['question']}</p>
        <div class="quiz-options">
            {options_html}
        </div>
        <div id="quiz-result" class="mt-4 hidden"></div>
    </div>
    '''
    
    container.innerHTML = html

def show_quiz_result(correct, explanation):
    """Show quiz result."""
    result_div = document.querySelector("#quiz-result")
    
    if correct:
        color_class = "text-green-700 bg-green-100"
        icon = "✅"
    else:
        color_class = "text-red-700 bg-red-100"
        icon = "❌"
    
    result_div.innerHTML = f'''
    <div class="p-3 rounded {color_class}">
        <p><strong>{icon} {explanation}</strong></p>
    </div>
    '''
    
    result_div.classList.remove("hidden")