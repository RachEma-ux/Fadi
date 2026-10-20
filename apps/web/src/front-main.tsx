import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { FrontApp } from "./FrontApp";
import "./style.css";
import "./modules/accueil/accueil.css";
const root = document.getElementById("root");
if (!root) throw new Error("Root missing");
createRoot(root).render(<StrictMode><FrontApp/></StrictMode>);
