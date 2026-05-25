import React, { useEffect, useState } from "react";
import { submitAnswers, getCachedQuiz } from "./api";
import { useNavigate } from "react-router-dom";

function normalize(s = "") {
  return String(s).replace(/<[^>]*>/g,' ').replace(/[^a-zA-Z0-9\s]/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
}

function similarityScore(a = "", b = "") {
  const A = normalize(a).split(/\s+/).filter(Boolean);
  const B = normalize(b).split(/\s+/).filter(Boolean);
  if (A.length === 0 && B.length === 0) return 1;
  if (A.length === 0 || B.length === 0) return 0;
  const setA = new Set(A);
  let common = 0;
  for (const w of B) if (setA.has(w)) common++;
  return Math.min(1, common / Math.max(A.length, B.length));
}

export default function QuizPage() {
  const [questions, setQuestions] = useState([]);
  const [cacheKey, setCacheKey] = useState(null);
  const [answersMap, setAnswersMap] = useState({});
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [goldData, setGoldData] = useState(null);
  const DEFAULT_SECONDS = 15 * 60; // default quiz duration (15 minutes)
  const [timerSeconds, setTimerSeconds] = useState(DEFAULT_SECONDS);
  const [showNav, setShowNav] = useState(true);
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "null");
  const [downloading, setDownloading] = useState(null);

  useEffect(() => { load(); }, []);

  // auto-save progress to localStorage for resume
  useEffect(() => {
    if (!cacheKey) return;
    const key = `quiz_progress_${cacheKey}`;
    const payload = { answersMap, index, timerSeconds, updatedAt: Date.now() };
    try { localStorage.setItem(key, JSON.stringify(payload)); } catch (e) {}
  }, [answersMap, index, timerSeconds, cacheKey]);

  // countdown timer
  useEffect(() => {
    if (!cacheKey || result) return;
    if (timerSeconds <= 0) {
      // auto-submit
      (async () => {
        try { await submit(); } catch (e) { console.error('Auto-submit failed', e); }
      })();
      return;
    }
    const t = setInterval(() => setTimerSeconds(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [cacheKey, timerSeconds, result]);

  async function load() {
    setLoading(true);
    try {
      const qs = new URLSearchParams(window.location.search);
      const topic = qs.get('topic');
      const courseId = qs.get('courseId');
      const userId = qs.get('userId');
      // request course-aware questions when courseId provided
      let url = new URL('http://localhost:4000/api/questions');
      if (courseId) url.searchParams.set('courseId', courseId);
      if (topic) url.searchParams.set('topic', topic);
      if (userId) url.searchParams.set('userId', userId);
      const resp = await fetch(url.toString());
      if (!resp.ok) throw new Error('Failed to load questions');
      const data = await resp.json();
      setQuestions(data.questions || []);
      setCacheKey(data.cacheKey || null);
      setAnswersMap({});
      setIndex(0);
      // restore progress if exists
      const key = `quiz_progress_${data.cacheKey}`;
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.answersMap) {
            setAnswersMap(parsed.answersMap || {});
            setIndex(typeof parsed.index === 'number' ? parsed.index : 0);
            setTimerSeconds(typeof parsed.timerSeconds === 'number' ? parsed.timerSeconds : DEFAULT_SECONDS);
          }
        } else {
          setTimerSeconds(DEFAULT_SECONDS);
        }
      } catch (e) {
        setTimerSeconds(DEFAULT_SECONDS);
      }
      setResult(null);
      setGoldData(null);
    } catch (e) {
      alert("Failed to load questions — check backend");
    } finally { setLoading(false); }
  }

  function setAnswerForCurrent(value) {
    const q = questions[index];
    if (!q) return;
    setAnswersMap(prev => ({ ...prev, [q.id]: value }));
  }

  function selectedFor(qid) { return answersMap[qid] ?? ""; }
  function goNext() { if (index < questions.length -1) setIndex(index+1); }
  function goPrev() { if (index>0) setIndex(index-1); }

  async function submit() {
    if (!user) return alert("Login first");
    const answersArr = Object.keys(answersMap).map(id => ({ id, answer: answersMap[id] }));
    try {
      const qs = new URLSearchParams(window.location.search);
      const courseId = qs.get('courseId');
      const res = await submitAnswers(user.id, answersArr, cacheKey, courseId);
      setResult(res);
      try { if (res && res.attemptId) localStorage.setItem('lastAttemptId', res.attemptId); } catch(e) {}
      const cacheRes = await getCachedQuiz(cacheKey);
      setGoldData(cacheRes.data);
      window.scrollTo({ top: 0, behavior: "smooth" });
      // clear saved progress for this cacheKey
      try { localStorage.removeItem(`quiz_progress_${cacheKey}`); } catch (e) {}
      // notify other parts of the app (MyLearning) to refresh course access
      try { window.dispatchEvent(new Event('coursesUpdated')); } catch (e) {}
    } catch (e) {
      alert("Submit failed");
    }
  }

  async function generateAndDownload(concept) {
    try {
      setDownloading(concept);
      // call AI tutor to get tutoring text
      const tutorResp = await fetch(`http://localhost:4000/api/ai-tutor`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ concept })
      });
      if (!tutorResp.ok) {
        const txt = await tutorResp.text().catch(()=>null);
        throw new Error(txt || `AI tutor failed ${tutorResp.status}`);
      }
      const tutorJson = await tutorResp.json();
      const tutoringText = tutorJson.tutoring || tutorJson.tutoringText || '';
      if (!tutoringText) throw new Error('No tutoring text returned');

      // request PDF
      const pdfResp = await fetch('http://localhost:4000/api/ai-tutor/pdf', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ concept, tutoringText })
      });
      if (!pdfResp.ok) {
        const txt = await pdfResp.text().catch(()=>null);
        throw new Error(txt || `PDF generation failed ${pdfResp.status}`);
      }
      const blob = await pdfResp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${concept.replace(/\s+/g,'_')}_tutoring.pdf`; document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download tutoring failed', err);
      alert('Download failed: ' + (err.message || err.toString()));
    } finally { setDownloading(null); }
  }

  if (loading) return <div className="card">Loading questions...</div>;
  if (!questions.length) return <div className="card">No questions available.</div>;

  if (result && goldData) {
    const goldQs = goldData.questions || [];
    const weak = Array.isArray(result.weak) ? result.weak : [];
    const returnToResults = result && (result.attemptId || result.attempt || result.attemptId) ? `/results?attemptId=${encodeURIComponent(result.attemptId || result.attempt || '')}` : window.location.href;
    return (
      <div className="card" style={{ maxWidth: 920, margin: "auto" }}>
        <h2>Results</h2>
        <p>Score: <strong>{result.score}</strong> / {result.total}</p>

        <div style={{ marginTop: 12 }}>
          <h3>Weak Concepts</h3>
          {weak.length === 0 ? (
            <div style={{ padding: 12, borderRadius: 8, background: "#f0fff4" }}>None — well done!</div>
          ) : (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
              {weak.map(w => (
                <div key={w.concept} style={{ background: "#fff", padding: 12, borderRadius: 10 }}>
                  <div style={{ fontWeight: 700 }}>{w.concept}</div>
                  <div style={{ fontSize: 13, color: "#555" }}>Accuracy: {Math.round(w.accuracy * 100)}%</div>
                  <div style={{ marginTop: 8 }}>
                    <a className="btn" href={`/tutor?concept=${encodeURIComponent(w.concept)}&returnTo=${encodeURIComponent(returnToResults)}`} target="_blank" rel="noreferrer">Learn</a>
                    <button className="btn" style={{ marginLeft: 8 }} onClick={() => generateAndDownload(w.concept)} disabled={downloading && downloading !== w.concept}>{downloading === w.concept ? 'Preparing PDF...' : 'Download Tutoring PDF'}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {Array.isArray(result.learning) && result.learning.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <h3>Suggested Learning Links</h3>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {result.learning.map((l, idx) => (
                <div key={idx} style={{ padding: 10, borderRadius: 8, background: '#fff' }}>
                  <div style={{ fontWeight: 700 }}>{l.concept}</div>
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {Array.isArray(l.links) && l.links.length > 0 ? (
                      l.links.map((link, j) => (
                        <a key={j} href={link.url} target="_blank" rel="noreferrer" className="btn" style={{ display: 'inline-block' }}>{link.title || link.url}</a>
                      ))
                    ) : (
                      (() => {
                        const topic = l.concept || (l.topic) || (l.tags && l.tags[0]) || 'programming';
                        return (
                          <>
                            <a className="btn" href={`/tutor?concept=${encodeURIComponent(topic)}&returnTo=${encodeURIComponent(returnToResults)}`} target="_blank" rel="noreferrer">Open tutor: {topic}</a>
                            <a className="btn" href={`https://www.google.com/search?q=${encodeURIComponent(topic + ' tutorial site:w3schools.com')}`} target="_blank" rel="noreferrer">W3Schools results: {topic}</a>
                            <a className="btn" href={`https://www.google.com/search?q=${encodeURIComponent(topic + ' tutorial site:geeksforgeeks.org')}`} target="_blank" rel="noreferrer">GeeksforGeeks results: {topic}</a>
                            <a className="btn" href={`https://www.google.com/search?q=${encodeURIComponent(topic + ' tutorial')}`} target="_blank" rel="noreferrer">Google: {topic}</a>
                          </>
                        );
                      })()
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <h3 style={{ marginTop: 18 }}>Question Review</h3>
        <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
          {goldQs.map((q, i) => {
            const userAns = answersMap[q.id] ?? "";
            const gold = q.answer ?? "";
            const sim = Math.round(similarityScore(gold, userAns) * 100);
            const isCorrect = q.type === "mcq" ? (normalize(userAns) === normalize(q.answer)) : (similarityScore(gold, userAns) >= 0.75);
            return (
              <div key={q.id} style={{ padding: 12, borderRadius: 8, background: "#fff" }}>
                <div style={{ fontWeight: 600 }}>{i+1}. {q.question}</div>
                <div style={{ marginTop: 8 }}>
                  <strong>Your answer:</strong> <span style={{ color: isCorrect ? "#0b875a" : "#c53030" }}>{userAns || <i>— no answer —</i>}</span>
                </div>
                <div><strong>Correct answer:</strong> <span>{gold}</span></div>
                <div><strong>Similarity:</strong> {sim}% {isCorrect ? '✅' : '❌'}</div>
                <hr style={{ marginTop: 8 }} />
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 18 }}>
          <button className="btn" onClick={() => { setResult(null); setGoldData(null); setIndex(0); setAnswersMap({}); }}>Retake</button>
          <button className="btn" onClick={() => navigate('/dashboard')}>Back to Dashboard</button>
          <button className="btn" onClick={async () => {
            try {
              const qs = new URLSearchParams(window.location.search);
              const courseId = qs.get('courseId');
              const payload = { result, goldData, answersMap, userId: (user?user.id:null), courseId };
              const resp = await fetch('http://localhost:4000/api/results/pdf', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
              });
              if (!resp.ok) {
                const t = await resp.text().catch(()=>null);
                throw new Error(t || `status ${resp.status}`);
              }
              const blob = await resp.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url; a.download = `quiz_results.pdf`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
            } catch (err) {
              console.error('Download results PDF failed', err);
              alert('Download failed: ' + (err.message || err.toString()));
            }
          }}>Download Results PDF</button>
        </div>
      </div>
    );
  }

  const q = questions[index];

  const totalAnswered = Object.values(answersMap).filter(v => v !== undefined && v !== null && String(v).trim() !== "").length;
  const progressPct = Math.round((totalAnswered / Math.max(1, questions.length)) * 100);
  const mm = String(Math.floor(timerSeconds / 60)).padStart(2, '0');
  const ss = String(timerSeconds % 60).padStart(2, '0');

  return (
    <div className="card" style={{ maxWidth: 920, margin: "auto" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Question {index+1} / {questions.length}</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ fontSize: 14, color: '#374151' }}>Time left: <strong>{mm}:{ss}</strong></div>
          <div style={{ width: 220, background: '#eef2ff', height: 10, borderRadius: 6 }}>
            <div style={{ width: `${progressPct}%`, height: '100%', background: '#7c3aed', borderRadius: 6 }} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', marginTop: 10 }}>
        <div style={{ flex: 1 }}>
          <div className="question">
            <div style={{ fontSize: 18, fontWeight: 600 }}>{q.question}</div>

            {q.type === "mcq" && q.options && (
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                {q.options.map((op, idx) => {
                  const selected = selectedFor(q.id) === op;
                  return (
                    <button key={idx} className="option" onClick={() => setAnswerForCurrent(op)} style={{
                      borderColor: selected ? '#c084fc' : undefined,
                      background: selected ? 'linear-gradient(90deg,#f5f3ff,#fff)' : undefined,
                      boxShadow: selected ? '0 6px 18px rgba(192,132,252,0.12)' : undefined
                    }}>
                      {op}
                    </button>
                  );
                })}
              </div>
            )}

            {q.type === "short" && (
              <textarea className="short" value={selectedFor(q.id)} onChange={(e)=>setAnswerForCurrent(e.target.value)} placeholder="Type your short answer..." />
            )}
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <button className="btn" onClick={goPrev} disabled={index===0}>Prev</button>
            {index < questions.length - 1 && <button className="btn" onClick={goNext}>Next</button>}
            {index === questions.length - 1 && <button className="btn btn-primary" onClick={submit}>Submit</button>}
          </div>
        </div>

        {showNav ? (
          <aside style={{ width: 260, background: '#fafafa', border: '1px solid #f1f5f9', borderRadius: 10, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontWeight: 700 }}>Quiz navigation</div>
              <button className="btn" onClick={() => setShowNav(false)} style={{ padding: '6px 8px' }}>Hide</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
              {questions.map((qq, i) => {
                const answered = answersMap[qq.id] !== undefined && String(answersMap[qq.id]).trim() !== '';
                return (
                  <button key={qq.id} className="btn" onClick={() => setIndex(i)} style={{ padding: '8px', height: 44, background: i===index ? '#eef2ff' : undefined, borderColor: answered ? '#10b981' : undefined }}>{i+1}</button>
                );
              })}
            </div>

            <div style={{ marginTop: 12 }}>
              <button className="btn btn-primary" onClick={() => { const confirmFinish = window.confirm('Finish attempt now?'); if (confirmFinish) submit(); }}>Finish attempt</button>
            </div>
          </aside>
        ) : (
          <div style={{ width: 80, display: 'flex', alignItems: 'flex-start' }}>
            <button className="btn" onClick={() => setShowNav(true)}>Show</button>
          </div>
        )}
      </div>
    </div>
  );
}