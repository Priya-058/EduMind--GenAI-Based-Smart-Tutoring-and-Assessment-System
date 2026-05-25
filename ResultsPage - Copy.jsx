import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export default function ResultsPage() {
  const [attempt, setAttempt] = useState(null);
  const [cacheData, setCacheData] = useState(null);
  const [loading, setLoading] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const qs = new URLSearchParams(location.search);
  const attemptIdParam = qs.get('attemptId');
  const [attemptId, setAttemptId] = useState(attemptIdParam || localStorage.getItem('lastAttemptId') || null);

  useEffect(() => {
    const p = new URLSearchParams(location.search).get('attemptId');
    if (p) {
      setAttemptId(p);
    } else {
      const saved = localStorage.getItem('lastAttemptId');
      if (saved) setAttemptId(saved);
    }
  }, [location.search]);

  useEffect(() => {
    if (!attemptId) return;
    (async () => {
      try {
        setLoading(true);
        const resp = await fetch(`http://localhost:4000/api/attempt/${attemptId}`);
        if (!resp.ok) throw new Error('Attempt fetch failed');
        const j = await resp.json();
        setAttempt(j.attempt || null);
        try { localStorage.setItem('lastAttemptId', attemptId); } catch(e) {}
        if (j.attempt && j.attempt.cacheKey) {
          const c = await fetch(`http://localhost:4000/api/cache/${j.attempt.cacheKey}`);
          if (c.ok) {
            const cj = await c.json();
            setCacheData(cj.data || null);
          }
        }
      } catch (err) {
        console.error(err);
        alert('Failed to load attempt details');
      } finally { setLoading(false); }
    })();
  }, [attemptId]);

  const handleDownload = async () => {
    const tutoringText = localStorage.getItem("tutoringText");
    const concept = localStorage.getItem("concept") || "tutoring";

    if (!tutoringText) {
      alert("No tutoring data found!");
      return;
    }

    try {
      const response = await fetch("http://localhost:4000/api/ai-tutor/pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ tutoringText, concept })
      });

      if (!response.ok) {
        const err = await response.json().catch(()=>({ error: 'Server error' }));
        alert("Error: " + (err.error || 'PDF generation failed'));
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${concept}_tutoring.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);

    } catch (error) {
      console.error(error);
      alert("PDF download failed");
    }
  };

  if (!attemptId) {
    return (
      <div className="card">
        <h2>Results</h2>
        <div>No attempt selected. Open a recent attempt from My Learning to review.</div>
      </div>
    );
  }

  if (loading) return <div className="card">Loading attempt...</div>;

  if (!attempt) return <div className="card">Attempt not found.</div>;

  const goldQs = (cacheData && cacheData.questions) || [];

  return (
    <div style={{ maxWidth: 1100, margin: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h2>Results — Review</h2>
        <div>
          <button className="btn" onClick={() => navigate('/mylearning')}>Back</button>
          <button className="btn btn-primary" onClick={handleDownload} style={{ marginLeft: 8 }}>Download Tutoring PDF</button>
        </div>
      </div>

      <div className="results-grid">
        <div>
          <div className="weak-card">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight:800 }}>Overview</div>
                <div style={{ color:'#6b7280' }}>Score: <strong style={{ color:'#111' }}>{attempt.score} / {attempt.total}</strong></div>
                <div style={{ color:'#6b7280', fontSize:13 }}>Date: {new Date(attempt.createdAt).toLocaleString()}</div>
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight:700, marginBottom:8 }}>Weak Concepts</div>
              {(attempt.weakConcepts || []).length === 0 && <div className="weak-item">None — great job!</div>}
              {(attempt.weakConcepts || []).map(w => (
                <div key={w.concept} className="weak-item">
                  <div className="title">{w.concept}</div>
                  <div style={{ color:'#6b7280', fontSize:13, marginBottom:8 }}>Accuracy: {Math.round((w.accuracy||0)*100)}%</div>
                  <div className="progress"><i style={{ width: `${Math.min(100,Math.round((1-(w.accuracy||0))*100))}%` }} /></div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ height: 16 }} />

          <div className="topic-card" style={{ padding: 14 }}>
            <div style={{ fontWeight:800, marginBottom:10 }}>Suggested Learning Links</div>
            <div className="topics-grid">
              {(() => {
                const map = {};
                if (Array.isArray(goldQs)) {
                  goldQs.forEach(q => {
                    const t = (q.topic || q.concept || 'General').toString();
                    map[t] = map[t] || [];
                    if (Array.isArray(q.links) && q.links.length) map[t].push(...q.links.slice(0,4));
                  });
                }
                (attempt.weakConcepts||[]).forEach(w => { map[w.concept] = map[w.concept] || []; });
                const keys = Object.keys(map);
                if (keys.length === 0) return <div style={{ color:'#6b7280' }}>No suggested links available.</div>;
                return keys.map((topic) => (
                  <div key={topic} className="topic-card">
                    <div className="topic-title">{topic}</div>
                    <div>
                      {(map[topic]||[]).slice(0,6).map((ln, j) => (
                        <a key={j} className="link-pill" href={ln.url || '#'} target="_blank" rel="noreferrer">{ln.title || ln.url}</a>
                      ))}
                      {(map[topic]||[]).length === 0 && <div style={{ color:'#6b7280' }}>No links yet.</div>}
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>

        <div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontWeight:800, marginBottom:8 }}>Question Review</div>
            <div style={{ color:'#6b7280', fontSize:13 }}>Review each question, see correct answer and recommended study resources.</div>
          </div>

          <div>
            {goldQs.map((q, i) => (
              <div key={q.id} className="question-card">
                <div className="qtitle">{i+1}. {q.question}</div>
                <div><strong>Correct:</strong> {q.answer || '—'}</div>
                {q.explanation && <div style={{ marginTop:8 }}><strong>Notes:</strong> {q.explanation}</div>}
                <div className="study-resources">
                  {Array.isArray(q.links) && q.links.length > 0 ? q.links.map((ln, idx) => (
                    <a key={idx} className="link-pill" href={ln.url} target="_blank" rel="noreferrer">{ln.title || ln.url}</a>
                  )) : (() => {
                    const topic = q.topic || q.concept || (q.tags && q.tags[0]) || q.question.split(/[\.\?\n]/)[0].slice(0,60);
                    return (
                      <>
                        <a className="link-pill" href={`/tutor?concept=${encodeURIComponent(topic)}&returnTo=${encodeURIComponent(window.location.href)}`} target="_blank" rel="noreferrer">Open tutor: {topic}</a>
                        <a className="link-pill" href={`https://www.google.com/search?q=${encodeURIComponent(topic + ' tutorial site:w3schools.com')}`} target="_blank" rel="noreferrer">W3Schools: {topic}</a>
                        <a className="link-pill" href={`https://www.google.com/search?q=${encodeURIComponent(topic + ' tutorial site:geeksforgeeks.org')}`} target="_blank" rel="noreferrer">GeeksforGeeks: {topic}</a>
                        <a className="link-pill" href={`https://www.google.com/search?q=${encodeURIComponent(topic + ' tutorial')}`} target="_blank" rel="noreferrer">Google: {topic}</a>
                      </>
                    );
                  })()}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
