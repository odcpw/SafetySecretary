import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { I18nProvider } from "@/i18n/I18nContext";
import { TuiApp } from "./TuiApp";
import "./tui.css";

const TUI_BASE_PATH = "/tui";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <BrowserRouter basename={TUI_BASE_PATH}>
          <TuiApp />
        </BrowserRouter>
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>
);
