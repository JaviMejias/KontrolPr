import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./index.css";
import { registerServiceWorker } from "./pwa/register-sw";
import { UpdateNotice } from "./pwa/UpdateNotice";

createRoot(document.getElementById("root")!).render(<StrictMode><App /><UpdateNotice /></StrictMode>);
registerServiceWorker();
