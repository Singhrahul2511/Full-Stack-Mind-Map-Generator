import os
import json
from flask import Flask, render_template, request, jsonify

# --- Secure AI Integration ---
AI_ENABLED = False
try:
    import google.generativeai as genai
    # This securely reads the key from the environment variable
    api_key = os.environ.get("GEMINI_API_KEY")
    if api_key:
        genai.configure(api_key=api_key)
        gemini_model = genai.GenerativeModel('gemini-1.5-flash-latest')
        AI_ENABLED = True
        print("✅ Gemini AI features enabled.")
    else:
        print("⚠️ Gemini API key environment variable not found. AI features disabled.")
except ImportError:
    print("⚠️ google.generativeai library not found. AI features disabled.")
except Exception as e:
    print(f"⚠️ An error occurred during Gemini setup: {e}")


# --- Flask App Initialization ---
app = Flask(__name__)

# --- Mock Suggestions (Default Fallback) ---
MOCK_SUGGESTIONS = {
    "Artificial Intelligence": ["Machine Learning", "NLP", "Computer Vision", "Robotics", "Knowledge Graphs"],
    "Web Development": ["Frontend", "Backend", "Databases", "REST APIs", "DevOps"],
    "Python Programming": ["Data Structures", "Web Frameworks", "Data Science", "Scripting", "Testing"],
    "Climate Change": ["Causes", "Effects", "Solutions", "Global Policy", "Carbon Emissions"]
}

def get_mock_suggestions(topic):
    return MOCK_SUGGESTIONS.get(topic, [
        f"Subtopic A for {topic}",
        f"Subtopic B for {topic}",
        f"Subtopic C for {topic}"
    ])

# --- AI Suggestion Function ---
def get_ai_suggestions(topic):
    if not AI_ENABLED:
        return get_mock_suggestions(topic)
    try:
        prompt = f"""
        Generate 5 to 7 subtopics for the main topic: '{topic}'.
        Return the subtopics as a JSON array of strings.
        Example: ["Subtopic1", "Subtopic2", ...]
        """
        response = gemini_model.generate_content(prompt)
        cleaned_response = response.text.strip().replace("```json", "").replace("```", "").strip()
        suggestions = json.loads(cleaned_response)
        return suggestions if isinstance(suggestions, list) else get_mock_suggestions(topic)
    except Exception as e:
        print(f"⚠️ Gemini error: {e}")
        return get_mock_suggestions(topic)

# --- Routes ---
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/suggest', methods=['POST'])
def suggest_subtopics():
    data = request.get_json()
    if not data or 'topic' not in data:
        return jsonify({"error": "Missing 'topic' field"}), 400
    topic = data['topic']
    suggestions = get_ai_suggestions(topic)
    return jsonify({"suggestions": suggestions})

# --- Run Server ---
if __name__ == '__main__':
    # For production on Render, Gunicorn will be used. This is for local dev.
    app.run(debug=False, port=5000)