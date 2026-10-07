import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";
import "./lib/i18n";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { TooltipProvider } from "./components/ui/overlays";
import { ApiError } from "./lib/api";
import { onQueryError, queryClient } from "./lib/queries";
import { applyTheme, useTheme } from "./lib/theme";
import { router } from "./router";

applyTheme();

onQueryError.current = (err) => {
  if (err instanceof ApiError && err.status === 401 && !router.state.location.pathname.startsWith("/login")) {
    queryClient.clear();
    void router.navigate({ to: "/login", search: { next: router.state.location.href } });
  }
};

function App() {
  const [theme] = useTheme();
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={250}>
        <RouterProvider router={router} />
        <Toaster theme={theme} position="bottom-right" richColors closeButton toastOptions={{ className: "font-sans" }} />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
