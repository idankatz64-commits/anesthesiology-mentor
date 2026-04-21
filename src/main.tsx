import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

if (import.meta.env.DEV || import.meta.env.MODE === "test") {
  // Lazy import so the web-vitals bundle never ships to production users.
  import("./lib/lcp").then(m => m.reportLCP());
}

createRoot(document.getElementById("root")!).render(<App />);
