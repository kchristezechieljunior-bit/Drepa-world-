
import { initializeFeed } from "./feed.js";
import { initializeComments } from "./comments.js";

export const API_URL =
  "https://drepa-world-api.kchristezechieljunior.workers.dev";

export const PAGE_SIZE = 10;

export const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
export const MAX_VIDEO_SIZE = 50 * 1024 * 1024;

/* =====================================
   OUTILS DE BASE
===================================== */

export function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };

    return entities[character];
  });
}

export function getInitials(name) {
  const words = String(name || "DW")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return "DW";

  return words
    .slice(0, 2)
    .map(word => word.charAt(0).toUpperCase())
    .join("");
}

export function formatDate(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

/* =====================================
   COMMUNICATION AVEC L'API
===================================== */

export async function apiRequest(path, options = {}) {
  const requestOptions = {
    ...options,
    credentials: "include",
    headers: {
      ...(options.headers || {})
    }
  };

  if (
    options.body &&
    !(options.body instanceof FormData) &&
    typeof options.body !== "string"
  ) {
    requestOptions.headers["Content-Type"] = "application/json";
    requestOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${API_URL}${path}`, requestOptions);

  let data;

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok || data.success === false) {
    const error = new Error(
      data.error || data.message || "Une erreur est survenue."
    );

    error.status = response.status;
    error.data = data;

    throw error;
  }

  return data;
}

/* =====================================
   MESSAGES D'INFORMATION
===================================== */

export function showMessage(element, message, type = "success") {
  if (!element) return;

  element.textContent = message;
  element.className = `form-message ${type}`;
}

/* =====================================
   IDENTITÉ DU MEMBRE
===================================== */

export function setIdentity(username) {
  const name = String(username || "Membre").trim();

  const elements = [
    document.getElementById("myUsername"),
    document.getElementById("sidebarUsername")
  ];

  elements.forEach(element => {
    if (element) {
      element.textContent = name;
    }
  });

  const initials = getInitials(name);

  const avatars = [
    document.getElementById("myAvatar"),
    document.getElementById("sidebarAvatar"),
    document.getElementById("composerAvatar")
  ];

  avatars.forEach(avatar => {
    if (avatar) {
      avatar.textContent = initials;
      avatar.setAttribute("aria-label", name);
    }
  });
}

/* =====================================
   AMBIANCE DE LA PAGE
===================================== */

export function updateAmbientPeriod() {
  const hour = new Date().getHours();

  let period = "day";

  if (hour >= 5 && hour < 12) {
    period = "morning";
  } else if (hour >= 12 && hour < 18) {
    period = "day";
  } else if (hour >= 18 && hour < 22) {
    period = "evening";
  } else {
    period = "night";
  }

  document.body.dataset.period = period;
}

/* =====================================
   VÉRIFICATION DU MEMBRE
===================================== */

export async function loadProfile() {
  const data = await apiRequest("/me");

  if (!data.member || !data.member.username) {
    throw new Error("Session invalide. Veuillez vous reconnecter.");
  }

  setIdentity(data.member.username);

  return data.member;
}

/* =====================================
   DÉCONNEXION
===================================== */

async function logout() {
  const button = document.getElementById("logoutButton");

  if (button) {
    button.disabled = true;
    button.textContent = "Déconnexion...";
  }

  try {
    await apiRequest("/logout", {
      method: "POST",
      body: {}
    });
  } catch (error) {
    console.error("Erreur de déconnexion :", error);
  }

  window.location.replace("connexion.html");
}

/* =====================================
   NAVIGATION
===================================== */

function initializeNavigation() {
  document.querySelectorAll("[data-nav]").forEach(link => {
    link.addEventListener("click", event => {
      if (link.getAttribute("aria-disabled") === "true") {
        event.preventDefault();
      }
    });
  });
}

/* =====================================
   INITIALISATION
===================================== */

async function initializePage() {
  const year = document.getElementById("currentYear");

  if (year) {
    year.textContent = new Date().getFullYear();
  }

  updateAmbientPeriod();

  initializeNavigation();

  const logoutButton = document.getElementById("logoutButton");

  if (logoutButton) {
    logoutButton.addEventListener("click", logout);
  }

  try {
    const member = await loadProfile();

    const context = {
      API_URL,
      PAGE_SIZE,
      MAX_IMAGE_SIZE,
      MAX_VIDEO_SIZE,
      apiRequest,
      escapeHTML,
      getInitials,
      formatDate,
      showMessage,
      member
    };

    initializeComments(context);
    initializeFeed(context);

  } catch (error) {
    console.error("Initialisation de l'espace membre :", error);

    if (error.status === 401 || error.status === 403) {
      window.location.replace("connexion.html");
      return;
    }

    const feed = document.getElementById("feed");

    if (feed) {
      feed.innerHTML = `
        <div class="feed-error">
          Impossible de charger votre espace membre.
          Veuillez vérifier votre connexion et réessayer.
        </div>
      `;
    }
  }
}

initializePage();
     
