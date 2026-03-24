import os
import re
import pandas as pd
import requests
from fastapi import FastAPI
from pydantic import BaseModel
from dotenv import load_dotenv
from google import genai
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from bs4 import BeautifulSoup
import pdfplumber

load_dotenv()
GEMINI_KEY = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=GEMINI_KEY)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
CSV_PATH = BASE_DIR / "tasks.csv"
PDF_PATH = BASE_DIR / "document.pdf"

df = pd.read_csv(CSV_PATH)
if "DOB" in df.columns:
    df["DOB"] = pd.to_datetime(df["DOB"], errors="coerce", dayfirst=True)

import base64
from typing import Optional, List

class HistoryItem(BaseModel):
    role: str
    text: str

class ChatRequest(BaseModel):
    question: str
    history: Optional[List[HistoryItem]] = []
    image_base64: Optional[str] = None
    image_mime: Optional[str] = None

def call_gemini(prompt):
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt
        )
        if response and response.text:
            return response.text.strip()
        return "Sorry, no response received."
    except Exception as e:
        if "RESOURCE_EXHAUSTED" in str(e):
            return "Gemini quota exceeded. Please try again later."
        return f"Gemini Error: {e}"

def call_gemini_with_history(question, history):
    """Call Gemini with chat memory context (last 6 exchanges)."""
    if not history:
        return call_gemini(question)
    ctx = "\n".join(
        ("User" if h.role == "user" else "Assistant") + ": " + h.text
        for h in history[-6:]
    )
    prompt = f"Continue this conversation.\n\n{ctx}\nUser: {question}\nAssistant:"
    return call_gemini(prompt)

def analyze_image(image_base64, image_mime, question):

    try:
        from google.genai import types
        image_bytes = base64.b64decode(image_base64)
        image_part = types.Part.from_bytes(data=image_bytes, mime_type=image_mime)
        text = question if question else "Describe this image in detail."
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[image_part, text]
        )
        if response and response.text:
            return response.text.strip()
        return "Could not analyze the image."
    except Exception as e:
        return f"Image Analysis Error: {e}"

EXCEL_KEYWORDS = [
    "employee", "salary", "department", "city", "experience", "age", "tasks", "completed", "pending", "male", "female", "address", "phone", "born",
    "average", "how many employees", "list employees"
]

def is_excel_question(question):
    return any(word in question.lower() for word in EXCEL_KEYWORDS)

def matches_dataframe_content(question):
    return any(col.lower() in question.lower() for col in df.columns)

def generate_pandas_code(question):
    prompt = f"""
You are a Python Pandas expert.
DataFrame name: df
Columns: {list(df.columns)}
Sample data:
{df.head(3).to_string()}

Rules:
- Return ONLY one single line of executable pandas code.
- Use only df.
- No explanation, no markdown, no backticks, no print().
- Use .str.contains("value", case=False, na=False) for text filtering.
- Use & for multiple conditions.
- Use .shape[0] for count.
- If born month use df["DOB"].dt.month
- Example for count: df[df["Department"].str.contains("HR", case=False, na=False)].shape[0]
- Example for list: df[df["Department"].str.contains("HR", case=False, na=False)]
Question: {question}
"""
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt
    )
    if response and response.text:
        code = response.text.strip().replace("```python", "").replace("```", "").strip()
        lines = [line.strip() for line in code.split("\n") if line.strip()]
        return lines[0] if lines else ""
    return ""

def run_pandas_code(code):
    try:
        if not code:
            return "Could not generate valid code."
        result = eval(code, {"__builtins__": {}}, {"df": df, "pd": pd})
        if isinstance(result, pd.DataFrame):
            return "No matching records found." if result.empty else result.to_string(index=False)
        if isinstance(result, pd.Series):
            return "No matching records found." if result.empty else result.to_string()
        return str(result)
    except Exception as e:
        return f"Execution Error: {e}"

def is_url(text):
    return text.startswith("http://") or text.startswith("https://")

def summarize_url(url):
    try:
        response = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=10)
        soup = BeautifulSoup(response.text, "html.parser")
        text_content = " ".join(p.get_text() for p in soup.find_all("p")[:20])
        if not text_content.strip():
            return "Unable to extract readable content."
        return call_gemini(f"Provide a professional 5-8 bullet summary.\nContent:\n{text_content}")
    except Exception as e:
        return f"Web Fetch Error: {e}"

def employee_summary(name):
    employee_data = df[df["Name"].str.contains(name, case=False, na=False)]
    if employee_data.empty:
        return "Employee not found."
    prompt = f"Create a professional employee profile summary.\nEmployee Data:\n{employee_data.to_string(index=False)}"
    return call_gemini(prompt)

def answer_from_pdf(question):
    if not PDF_PATH.exists():
        return "PDF file not found."
    try:
        pages = []
        with pdfplumber.open(PDF_PATH) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if text and text.strip():
                    pages.append(re.sub(r"\s+", " ", text))
    except Exception as e:
        return f"PDF read error: {e}"

    if not pages:
        return "PDF has no readable text."

    stopwords = {
        "what", "are", "the", "is", "in", "of", "this", "for", "and", "how", "does", "was", "who", "did", "give", "tell", "me", "about", "explain", "include", "included", "role", "page", "do",
        "describe", "list", "show", "which", "where", "when", "its", "their", "that", "with", "from", "have", "has", "been", "any", "all", "can", "planned", "project", "system", "used", "use"
    }
    question_words = [
        w.strip("?.,!") for w in question.lower().split()
        if len(w) >= 3 and w.strip("?.,!") not in stopwords
    ]
    if not question_words:
        question_words = [w for w in question.lower().split() if len(w) >= 3]

    def score_page(page_text):
        lower = page_text.lower()
        return sum(lower.count(w) for w in question_words)

    content_pages = [(i, text) for i, text in enumerate(pages) if i >= 3]
    scored_pages = sorted(content_pages, key=lambda x: score_page(x[1]), reverse=True)
    top_pages = [text for _, text in scored_pages[:4]]
    combined_text = " ".join(top_pages)[:8000]
    prompt = f"""
You are an AI assistant. Answer the question based on the document content below.
Give a detailed and complete answer using all relevant information from the content.
Do NOT say "Information not found in document" unless the topic is truly absent.
Document Content:
{combined_text}
Question: {question}
Answer:
"""
    return call_gemini(prompt) or "Sorry, could not get answer from PDF."

def is_pdf_relevant(question):
    prompt = f"""You are a routing assistant.
A user asked: "{question}"

We have a PDF document about a Makeover Management System
(a salon/beauty parlour booking system built with PHP and MySQL).

Should this question be answered from that PDF document?
Reply with only one word: YES or NO.

- YES: if the question is about the project features, modules, technology,
       testing, conclusion, diagrams, frontend, backend, database, or
       anything related to the Makeover Management System document.
- NO:  if it is a general knowledge question (Python, FastAPI, AI concepts,
       programming in general, etc.)"""
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt
        )
        return "YES" in response.text.strip().upper()
    except Exception:
        return False

@app.post("/chat")
def chat(request: ChatRequest):
    question = (request.question or "").strip()
    try:
        if request.image_base64:
            return {"answer": analyze_image(request.image_base64, request.image_mime or "image/jpeg", question)}

        if question.lower().endswith("summary"):
            name = question[:-7].strip()
            return {"answer": employee_summary(name)}

        if is_url(question):
            return {"answer": summarize_url(question)}

        if is_excel_question(question) or matches_dataframe_content(question):
            code = generate_pandas_code(question)
            result = run_pandas_code(code)
            return {"answer": result}

        if is_pdf_relevant(question):
            pdf_answer = answer_from_pdf(question)
            if pdf_answer:
                return {"answer": pdf_answer}

        return {"answer": call_gemini_with_history(question, request.history or [])}

    except Exception as e:
        return {"answer": f"System Error: {e}"}

FRONTEND_DIR = BASE_DIR.parent / "frontend"

if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")