import React from "react";
import ReactDOM from "react-dom/client";
import "./i18n";
import { installDevtoolsConsoleSink } from "./lib/devtools_console";
import App from "./App";

// Dev-only: mirror webview console messages to scripts\devtools\logs\console.
installDevtoolsConsoleSink();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
