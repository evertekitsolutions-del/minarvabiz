import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./index.css";

const allowedThemes = new Set(["light", "midnight", "ocean", "emerald", "violet"]);
const savedTheme = window.localStorage.getItem("minarvabiz.ui.theme");
if (savedTheme && allowedThemes.has(savedTheme)) document.documentElement.dataset.theme = savedTheme;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
