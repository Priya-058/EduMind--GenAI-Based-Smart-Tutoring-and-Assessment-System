# smart_assessment_ui.py
import random
import nltk
from nltk.util import ngrams
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np
import tkinter as tk
from tkinter import messagebox

nltk.download('punkt', quiet=True)

# -------------------------------
# Questions Database (10 per topic)
# -------------------------------
questions_db = {
    "Data Structures": [
        {"question": "What data structure uses FIFO principle?", "answer": "queue"},
        {"question": "Which data structure is used for recursion?", "answer": "stack"},
        {"question": "Which data structure gives fastest lookup?", "answer": "hash table"},
        {"question": "Which data structure uses LIFO principle?", "answer": "stack"},
        {"question": "What data structure is used in BFS traversal?", "answer": "queue"},
        {"question": "Which data structure stores elements in hierarchical form?", "answer": "tree"},
        {"question": "What is the data structure used to implement priority queues?", "answer": "heap"},
        {"question": "Which data structure uses key-value pairs?", "answer": "hash map"},
        {"question": "What is the time complexity of searching in a balanced binary search tree?", "answer": "log n"},
        {"question": "Which data structure allows insertion and deletion from both ends?", "answer": "deque"},
    ],
    "Algorithms": [
        {"question": "What is the time complexity of binary search?", "answer": "log n"},
        {"question": "Which algorithm is used for sorting?", "answer": "merge sort"},
        {"question": "What algorithm is used to find shortest path?", "answer": "dijkstra"},
        {"question": "Which algorithm is used for minimum spanning tree?", "answer": "kruskal"},
        {"question": "Which algorithm uses divide and conquer?", "answer": "quick sort"},
        {"question": "What is the worst case complexity of bubble sort?", "answer": "n square"},
        {"question": "Which algorithm is used for finding strongly connected components?", "answer": "kosaraju"},
        {"question": "Which algorithm is used for pattern matching?", "answer": "kmp"},
        {"question": "Which algorithm finds all pairs shortest path?", "answer": "floyd warshall"},
        {"question": "Which algorithm is used for compression?", "answer": "huffman coding"},
    ],
    "DBMS": [
        {"question": "Which normal form removes transitive dependency?", "answer": "3nf"},
        {"question": "What is used to uniquely identify a record?", "answer": "primary key"},
        {"question": "What language is used to query databases?", "answer": "sql"},
        {"question": "Which normal form is based on candidate keys?", "answer": "bcnf"},
        {"question": "Which SQL command is used to remove all records from a table?", "answer": "truncate"},
        {"question": "What is the purpose of a foreign key?", "answer": "referential integrity"},
        {"question": "Which join returns only matching rows?", "answer": "inner join"},
        {"question": "What is a collection of related data called?", "answer": "database"},
        {"question": "Which command is used to change data in a table?", "answer": "update"},
        {"question": "What is the full form of ACID in DBMS?", "answer": "atomicity consistency isolation durability"},
    ]
}

# -------------------------------
# Helper: Calculate NLP similarity
# -------------------------------
def ngram_similarity(ans1, ans2, n=2):
    vectorizer = CountVectorizer(analyzer='char', ngram_range=(n, n))
    vectors = vectorizer.fit_transform([ans1.lower(), ans2.lower()])
    return cosine_similarity(vectors)[0][1]

# -------------------------------
# Smart Assessment Class
# -------------------------------
class SmartAssessmentApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Smart Assessment System (Phase 1)")
        self.root.geometry("650x420")
        self.root.config(bg="#f4f6ff")

        self.title_label = tk.Label(root, text="GenAI-Based Smart Assessment System",
                                    font=("Arial", 16, "bold"), bg="#f4f6ff", fg="#2b2b52")
        self.title_label.pack(pady=15)

        self.question_label = tk.Label(root, text="", font=("Arial", 14), wraplength=550, bg="#f4f6ff")
        self.question_label.pack(pady=20)

        self.answer_entry = tk.Entry(root, width=40, font=("Arial", 12))
        self.answer_entry.pack(pady=10)

        self.submit_btn = tk.Button(root, text="Submit Answer", command=self.submit_answer,
                                    font=("Arial", 12), bg="#4b7bec", fg="white", width=15)
        self.submit_btn.pack(pady=15)

        self.progress_label = tk.Label(root, text="", font=("Arial", 12), bg="#f4f6ff")
        self.progress_label.pack()

        # Initialize quiz
        self.prepare_questions()
        self.current_index = 0
        self.scores = {"Data Structures": [], "Algorithms": [], "DBMS": []}
        self.show_question()

    def prepare_questions(self):
        all_questions = []
        for topic, qs in questions_db.items():
            all_questions.extend([(topic, q["question"], q["answer"]) for q in qs])
        self.selected = random.sample(all_questions, 10)  # pick 10 total for demo

    def show_question(self):
        if self.current_index < len(self.selected):
            topic, q, a = self.selected[self.current_index]
            self.question_label.config(text=f"Q{self.current_index+1} ({topic}): {q}")
            self.progress_label.config(text=f"Question {self.current_index+1} of {len(self.selected)}")
            self.answer_entry.delete(0, tk.END)
        else:
            self.show_results()

    def submit_answer(self):
        user_ans = self.answer_entry.get().strip().lower()
        if not user_ans:
            messagebox.showwarning("Empty", "Please enter an answer before submitting!")
            return

        topic, q, a = self.selected[self.current_index]
        sim = ngram_similarity(user_ans, a)
        score = 1 if sim > 0.5 else 0
        self.scores[topic].append(score)

        messagebox.showinfo("Answer Submitted",
                            f"Correct Answer: {a}\nYour Similarity Score: {sim:.2f}")

        self.current_index += 1
        self.show_question()

    def show_results(self):
        topic_scores = {t: np.mean(s) if s else 0 for t, s in self.scores.items()}
        result_text = "\n".join([f"{t}: {score*100:.2f}% accuracy" for t, score in topic_scores.items()])
        weak_topic = min(topic_scores, key=topic_scores.get)

        messagebox.showinfo("Assessment Complete ✅",
                            f"Your Topic-wise Performance:\n\n{result_text}\n\n"
                            f"Weakest Area: {weak_topic}")

        self.root.destroy()


# -------------------------------
# Run App
# -------------------------------
if __name__ == "__main__":
    print("[DEBUG] major.py starting (creating Tk root)")
    root = tk.Tk()
    # try to ensure the window is visible and on top
    try:
        root.update_idletasks()
        root.deiconify()
        root.lift()
        root.attributes('-topmost', True)
        root.after(100, lambda: root.attributes('-topmost', False))
    except Exception:
        pass
    print("[DEBUG] Tk root created")
    app = SmartAssessmentApp(root)
    print("[DEBUG] SmartAssessmentApp initialized — entering mainloop")
    root.mainloop()
    print("[DEBUG] mainloop exited — program ending")