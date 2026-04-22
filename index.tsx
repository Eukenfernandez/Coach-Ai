import React from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const app = (
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

function normalizePathname(pathname: string) {
  if (!pathname || pathname === "/") return "/";
  return pathname.endsWith("/") ? pathname.slice(0, -1) || "/" : pathname;
}

function isLoginRoute(pathname: string, hash: string) {
  return normalizePathname(pathname) === "/login" || hash.includes("login");
}

function isNativeCapacitorShell() {
  if (typeof window === "undefined") return false;
  return (
    window.location.protocol === "capacitor:" ||
    window.location.origin === "capacitor://localhost"
  );
}

const shouldHydrate =
  rootElement.hasChildNodes() &&
  !isLoginRoute(window.location.pathname, window.location.hash) &&
  !isNativeCapacitorShell();

if (shouldHydrate) {
  hydrateRoot(rootElement, app);
} else {
  createRoot(rootElement).render(app);
}
