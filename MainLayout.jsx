import React, { useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";

export default function MainLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user") || "null");
    if (!user) navigate("/");
  }, [navigate]);

  function logout() {
    localStorage.removeItem("user");
    navigate("/");
  }

  const user = JSON.parse(localStorage.getItem("user") || "null");

  return (
    <div className="main-layout">
      <main className="main-content full-width">
        {children}
      </main>
    </div>
  );
}
