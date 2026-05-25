// src/TutorPage.jsx
import React, { useState, useEffect } from "react";
import { getTutorFeedback } from "./api";
import { useSearchParams, useNavigate } from "react-router-dom";

export default function TutorPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const conceptParam = (searchParams.get("concept") || "").trim();
  const returnToParam = (searchParams.get("returnTo") || "").trim();

  const [tutoring, setTutoring] = useState("");
  const [loadingTut, setLoadingTut] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!conceptParam) return;

    (async () => {
      setError(null);
      setTutoring("");
      setLoadingTut(true);

      try {
        // getTutorFeedback should call /api/ai-tutor and return { tutoring: "..." }
        const res = await getTutorFeedback({ concept: conceptParam, userAnswer: "", correctAnswer: "" });

        // normalize result
        const text = res && typeof res === "object" ? (res.tutoring ?? JSON.stringify(res)) : String(res || "");
        setTutoring(text);
        try { localStorage.setItem("tutoringText", text); localStorage.setItem("concept", conceptParam); } catch (e) {}
      } catch (e) {
        console.error("Failed to generate tutoring:", e);
        setError("Failed to generate tutoring: " + (e.message || e.toString()));
        setTutoring("");
      } finally {
        setLoadingTut(false);
      }
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conceptParam]);

  // download PDF helper: POST tutoring text to backend and auto-trigger download
  async function downloadPdf(concept, tutoringText) {
    try {
      if (!tutoringText || !tutoringText.trim()) {
        alert("No tutoring text available to download.");
        return;
      }
      setLoadingPdf(true);
      setError(null);

      const resp = await fetch("http://localhost:4000/api/ai-tutor/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept, tutoringText: tutoringText })
      });

      if (!resp.ok) {
        const txt = await resp.text().catch(() => null);
        throw new Error(txt || `status ${resp.status}`);
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${concept.replace(/\s+/g, "_")}_tutoring.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF download failed:", err);
      setError("PDF download failed: " + (err.message || err.toString()));
    } finally {
      setLoadingPdf(false);
    }
  }

  if (!conceptParam) {
    return (
      <div className="card" style={{ maxWidth: 920, margin: "auto" }}>
        <h2>AI Tutor</h2>
        <p>
          Tutoring is only available after taking a quiz. Click <strong>Learn</strong> next to the weakest concept on the Results page
          and you'll be taken here. Use the Download PDF button to get a copy of the tutoring content.
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
          <button className="btn" onClick={() => navigate("/quiz")}>Take Quiz</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ maxWidth: 920, margin: "auto" }}>
      <h2>AI Tutor — {conceptParam}</h2>

      {returnToParam && (
        <div style={{ marginBottom: 12 }}>
          <button className="btn" onClick={() => {
            try {
              const url = new URL(returnToParam, window.location.href);
              if (url.origin === window.location.origin) {
                // internal redirect using react-router
                navigate(url.pathname + url.search);
              } else {
                window.location.href = returnToParam;
              }
            } catch (e) {
              // fallback: go back in history
              window.history.back();
            }
          }}>Back to results</button>
        </div>
      )}

      {loadingTut ? (
        <div style={{ marginTop: 16 }}>Generating tutoring overview — please wait...</div>
      ) : (
        <>
          <div style={{ marginTop: 6 }}>
            <strong>Overview</strong>
          </div>
          <div className="tutor-output" style={{ marginTop: 12, whiteSpace: "pre-wrap", background: "#fafafa", padding: 12, borderRadius: 6 }}>
            {tutoring || "No tutoring content available."}
          </div>
        </>
      )}

      <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button
          className="btn"
          onClick={() => downloadPdf(conceptParam, tutoring)}
          disabled={loadingTut || loadingPdf || !tutoring}
          style={{ opacity: loadingTut || loadingPdf || !tutoring ? 0.6 : 1 }}
        >
          {loadingPdf ? "Preparing PDF..." : "Download Tutoring PDF"}
        </button>

        <button
          className="btn"
          onClick={() => {
            if (!tutoring) return;
            navigator.clipboard?.writeText(tutoring).then(() => alert("Overview copied to clipboard")).catch(() => alert("Copy failed"));
          }}
          disabled={!tutoring}
        >
          Copy Overview
        </button>

        <button
          className="btn"
          onClick={() => { setTutoring(""); setError(null); setLoadingTut(true); /* re-generate tutoring */ (async () => {
            try {
              const res = await getTutorFeedback({ concept: conceptParam, userAnswer: "", correctAnswer: "" });
              const text = res && typeof res === "object" ? (res.tutoring ?? JSON.stringify(res)) : String(res || "");
              setTutoring(text);
            } catch (e) {
              setError("Regenerate failed: " + (e.message || e.toString()));
            } finally {
              setLoadingTut(false);
            }
          })(); }}
          disabled={loadingTut}
        >
          Regenerate Tutoring
        </button>
      </div>

      {error && <div style={{ marginTop: 12, padding: 10, background: "#fff5f5", color: "#9b2c2c", borderRadius: 6 }}>{error}</div>}
    </div>
  );
}