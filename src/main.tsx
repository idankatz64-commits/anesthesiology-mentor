import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { isDemo } from "./lib/demoMode";

// לוכד ?demo לפני שהראוטר מוחק את ה-query (מצב דמו להצגות)
isDemo();

createRoot(document.getElementById("root")!).render(<App />);
