import React from "react";
import { Link } from "react-router-dom";

export default function HomePage() {
  return (
    <div className="card" style={{ maxWidth: 920, margin: 'auto' }}>
      <h2>Welcome to EDUMIND</h2>
      <p>Ready to improve your computer science skills? Start a short diagnostic quiz to get personalized learning recommendations.</p>
      <div style={{ marginTop: 12 }}>
        <Link to="/quiz" className="btn btn-primary">Take a Test</Link>
        <Link to="/dashboard" className="btn">View Dashboard</Link>
      </div>
    </div>
  );
}
