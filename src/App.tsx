import { RouterProvider } from "@tanstack/react-router";
import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { useTranslation } from "react-i18next";
import { updateAppLanguage } from "./helpers/language_helpers";
import { PhotoServiceProvider } from "./helpers/services/PhotoServiceProvider";
import { syncThemeWithLocal } from "./helpers/theme_helpers";
import "./localization/i18n";
import { router } from "./routes/router";
import { GithubUpdateNotifier } from "./components/GithubUpdateNotifier";

export default function App() {
  const { i18n } = useTranslation();

  useEffect(() => {
    syncThemeWithLocal();
    updateAppLanguage(i18n);
  }, [i18n]);

  return (
    <PhotoServiceProvider>
      <RouterProvider router={router} />
    </PhotoServiceProvider>
  );
}

const root = createRoot(document.getElementById("app")!);
root.render(
  <React.StrictMode>
    <GithubUpdateNotifier />
    <App />
  </React.StrictMode>,
);
