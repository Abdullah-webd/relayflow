import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./lib/auth";
import "./index.css";

// Build marker — check this in the browser console to confirm you're on the latest UI.
console.log("%cRelayFlow UI build: 2026-08-22-send-fix", "color:#4f46e5;font-weight:bold");

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
