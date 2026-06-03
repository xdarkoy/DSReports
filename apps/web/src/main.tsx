import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
// The designer's CSS is imported by @reporting/designer's entrypoint (index.ts).

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
