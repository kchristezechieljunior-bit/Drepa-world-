
import { initializeFeed } from "./feed.js";
import { initializeComments } from "./comments.js";

/* =========================================================
   DREPA-WORLD — ESPACE MEMBRE
   Gestion de la session, du profil et de l'initialisation
   ========================================================= */

const API_URL = "https://drepa-world-api.kchristezechieljunior.workers.dev";

const elements = {
    profileName: document.getElementById("profileName"),
    profileAvatar: document.getElementById("profileAvatar"),
    welcomeName: document.getElementById("welcomeName"),
    logoutButton: document.getElementById("logoutButton"),
    feedStatus: document.getElementById("feedStatus")
};

/* ---------- REQUÊTES API ---------- */

async function apiRequest(path, options = {}) {
    const config = {
        ...options,
        credentials: "include",
        headers: {
            ...(options.headers || {})
        }
    };

    if (
        config.body &&
        !(config.body instanceof FormData) &&
        typeof config.body === "object"
    ) {
        config.headers["Content-Type"] = "application/json";
        config.body = JSON.stringify(config.body);
    }

    let response;

    try {
        response = await fetch(API_URL + path, config);
    } catch (error) {
        throw new Error("Impossible de contacter le serveur. Vérifie ta connexion Internet.");
    }

    let data;

    try {
        data = await response.json();
    } catch {
        throw new Error("Le serveur a renvoyé une réponse invalide.");
    }

    if (!response.ok || data.success === false) {
        throw new Error(data.message || "Une erreur est survenue.");
    }

    return data;
}

/* ---------- SÉCURITÉ HTML ---------- */

function escapeHTML(value) {
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

/* ---------- INITIALES ---------- */

function getInitials(value) {
    const name = String(value || "").trim();

    if (!name) {
        return "DW";
    }

    const parts = name.split(/\s+/);

    return parts
        .slice(0, 2)
        .map(part => part.charAt(0).toUpperCase())
        .join("");
}

/* ---------- DATES ---------- */

function formatDate(value) {
    if (!value) {
        return "";
    }

    const date = new Date(
        String(value).replace(" ", "T") + (
            String(value).includes("Z") ? "" : "Z"
        )
    );

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    return new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    }).format(date);
}

/* ---------- MESSAGES ---------- */

function showMessage(element, message, type = "") {
    if (!element) {
        return;
    }

    element.textContent = message;
    element.className = "status-message";

    if (type) {
        element.classList.add(type);
    }

    element.hidden = !message;
}

/* ---------- AMBIANCE ---------- */

function updateAmbientPeriod() {
    const hour = new Date().getHours();

    document.body.classList.remove(
        "morning",
        "day",
        "evening",
        "night"
    );

    if (hour >= 5 && hour < 11) {
        document.body.classList.add("morning");
    } else if (hour >= 11 && hour < 18) {
        document.body.classList.add("day");
    } else if (hour >= 18 && hour < 22) {
        document.body.classList.add("evening");
    } else {
        document.body.classList.add("night");
    }
}

/* ---------- PROFIL ---------- */

async function loadProfile() {
    try {
        const data = await apiRequest("/me");

        if (!data.member) {
            throw new Error("Session invalide.");
        }

        const member = data.member;

        const username =
            member.username ||
            member.pseudonym ||
            "Membre DREPA-WORLD";

        if (elements.profileName) {
            elements.profileName.textContent = username;
        }

        if (elements.welcomeName) {
            elements.welcomeName.textContent = username;
        }

        if (elements.profileAvatar) {
            elements.profileAvatar.textContent = getInitials(username);
        }

        return member;

    } catch (error) {
        window.location.replace("connexion.html");
        return null;
    }
}

/* ---------- DÉCONNEXION ---------- */

async function logout() {
    if (elements.logoutButton) {
        elements.logoutButton.disabled = true;
    }

    try {
        await apiRequest("/logout", {
            method: "POST",
            body: {}
        });

        window.location.replace("connexion.html");

    } catch (error) {
        if (elements.logoutButton) {
            elements.logoutButton.disabled = false;
        }

        alert(error.message || "La déconnexion a échoué.");
    }
}

/* ---------- NAVIGATION ---------- */

function initializeNavigation() {
    document.querySelectorAll("[data-nav]").forEach(button => {
        button.addEventListener("click", () => {
            if (button.disabled) {
                return;
            }

            const target = button.dataset.nav;

            if (target === "feed") {
                document.getElementById("feed")?.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
            }
        });
    });
}

/* ---------- CONTEXTE PARTAGÉ ---------- */

const context = {
    API_URL,
    elements,
    apiRequest,
    escapeHTML,
    getInitials,
    formatDate,
    showMessage
};

/* ---------- INITIALISATION ---------- */

let cleanupFeed = null;

async function initializePage() {
    updateAmbientPeriod();

    if (elements.feedStatus) {
        elements.feedStatus.hidden = false;
        elements.feedStatus.textContent = "Chargement de votre espace membre...";
    }

    const member = await loadProfile();

    if (!member) {
        return;
    }

    if (elements.logoutButton) {
        elements.logoutButton.addEventListener("click", logout);
    }

    initializeNavigation();

    try {
        const feed = initializeFeed(context);

        initializeComments({
            ...context,
            loadPosts: feed.loadPosts
        });

        cleanupFeed = feed.cleanup;

        await feed.loadPosts(true);

    } catch (error) {
        console.error("Erreur d'initialisation :", error);

        showMessage(
            elements.feedStatus,
            error.message || "Impossible de charger le fil d'actualité.",
            "error"
        );
    }
}

/* ---------- NETTOYAGE ---------- */

window.addEventListener("pagehide", () => {
    if (typeof cleanupFeed === "function") {
        cleanupFeed();
    }
});

/* ---------- DÉMARRAGE ---------- */

initializePage();
          
