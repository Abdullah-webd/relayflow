import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { MotionConfig } from "motion/react";
import { AuthProvider } from "./lib/auth";
import "./index.css";

// Build marker — check this in the browser console to confirm you're on the latest UI.
console.log("%cRelayFlow UI build: 2026-10-08-motion", "color:#0566E0;font-weight:bold");

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        {/* Honors the device's "reduce motion" setting: movement off, gentle fades kept. */}
        <MotionConfig reducedMotion="user">
          <App />
        </MotionConfig>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
