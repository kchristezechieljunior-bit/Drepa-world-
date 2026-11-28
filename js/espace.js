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
"&": "&",
"<": "<",
">": ">",
'"': """,
"'": "'"
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

const response = await fetch("${API_URL}${path}", requestOptions);

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
element.className = "form-message ${type}";
}

/* =====================================
IDENTITÉ DU MEMBRE
===================================== */

export function setIdentity(username) {
const name = String(username || "Membre").trim();

const elements = [
document.getElementById("myUsername"),
document.getElementById("sidebarUsername"),
document.getElementById("profileUsername")
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
SUGGESTIONS D'AMIS
===================================== */

function getSafePhotoUrl(value) {
if (!value) return "";

try {
const url = new URL(value);

if (url.protocol !== "https:" && url.protocol !== "http:") {
  return "";
}

return url.href;

} catch {
return "";
}
}

function updateSuggestionsLink(list, hasMore) {
if (!list) return;

const container = list.parentElement;

if (!container) return;

let link = container.querySelector("#viewAllFriendSuggestions");

if (!hasMore) {
if (link) link.remove();
return;
}

if (!link) {
link = document.createElement("a");
link.id = "viewAllFriendSuggestions";
link.className = "friend-suggestions-view-all";
link.href = "suggestions.html";
link.textContent = "Voir toutes les suggestions";
container.appendChild(link);
}
}

async function loadFriendSuggestions(context) {
const list = document.getElementById("friendSuggestionsList");
const message = document.getElementById("friendSuggestionsMessage");

if (!list) return;

list.innerHTML = "<p>Chargement des suggestions...</p>";
updateSuggestionsLink(list, false);

if (message) {
message.textContent = "";
}

try {
const data = await context.apiRequest("/friend-suggestions");

const suggestions = Array.isArray(data.suggestions)
  ? data.suggestions
  : [];

if (!suggestions.length) {
  list.innerHTML = `
    <p>
      Aucune suggestion pour le moment.
      Revenez un peu plus tard !
    </p>
  `;

  updateSuggestionsLink(list, false);
  return;
}

// L'accueil affiche seulement les trois premières suggestions.
const previewSuggestions = suggestions.slice(0, 3);

list.innerHTML = previewSuggestions.map(friend => {
  const id = Number(friend.member_id);

  if (!Number.isSafeInteger(id) || id < 1) {
    return "";
  }

  const username = context.escapeHTML(
    friend.username || "Membre"
  );

  const initials = context.escapeHTML(
    context.getInitials(friend.username)
  );

  const photoUrl = getSafePhotoUrl(friend.photo_url);

  const mutualCount = Math.max(
    0,
    Number(friend.mutual_friends_count) || 0
  );

  const avatar = photoUrl
    ? `<img
         src="${context.escapeHTML(photoUrl)}"
         alt=""
         class="friend-suggestion-avatar"
         loading="lazy"
       >`
    : `<span class="friend-suggestion-avatar friend-suggestion-initials">${initials}</span>`;

  return `
    <article class="friend-suggestion-card">
      <div class="friend-suggestion-identity">
        ${avatar}

        <div class="friend-suggestion-info">
          <strong>${username}</strong>
          <span>
            ${mutualCount} ami${mutualCount > 1 ? "s" : ""} en commun
          </span>
        </div>
      </div>

      <button
        type="button"
        class="friend-suggestion-add"
        data-friend-id="${id}"
      >
        Ajouter en ami
      </button>
    </article>
  `;
}).join("");

// Le lien apparaît seulement s'il existe plus de trois suggestions.
updateSuggestionsLink(list, suggestions.length > 3);

} catch (error) {
console.error("Chargement des suggestions :", error);

list.innerHTML = `
  <p>
    Impossible de charger les suggestions.
    Veuillez réessayer plus tard.
  </p>
`;

updateSuggestionsLink(list, false);

}
}

function initializeFriendSuggestions(context) {
const list = document.getElementById("friendSuggestionsList");
const message = document.getElementById("friendSuggestionsMessage");

if (!list) return;

list.addEventListener("click", async event => {
const button = event.target.closest(".friend-suggestion-add");

if (!button || button.disabled) return;

const friendId = Number(button.dataset.friendId);

if (!Number.isSafeInteger(friendId) || friendId < 1) {
  return;
}

button.disabled = true;
button.textContent = "Envoi en cours...";

if (message) {
  message.textContent = "";
}

try {
  await context.apiRequest("/friend-requests", {
    method: "POST",
    body: {
      member_id: friendId
    }
  });

  button.textContent = "Demande envoyée";
  button.classList.add("request-sent");

  if (message) {
    message.textContent = "Votre demande d'amitié a été envoyée.";
  }

} catch (error) {
  console.error("Envoi de demande d'amitié :", error);

  button.disabled = false;
  button.textContent = "Ajouter en ami";

  if (message) {
    message.textContent =
      error.message || "Impossible d'envoyer la demande.";
  }
}

});

loadFriendSuggestions(context);
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
MENU MOBILE
===================================== */

function initializeMobileMenu() {
const toggle = document.getElementById("mobileMenuToggle");
const backdrop = document.getElementById("mobileMenuBackdrop");
const sidebar = document.getElementById("leftSidebar");

if (!toggle || !backdrop || !sidebar) return;

function closeMenu() {
document.body.classList.remove("mobile-menu-open");
toggle.setAttribute("aria-expanded", "false");
toggle.setAttribute("aria-label", "Ouvrir le menu");
toggle.textContent = "☰";
}

function openMenu() {
document.body.classList.add("mobile-menu-open");
toggle.setAttribute("aria-expanded", "true");
toggle.setAttribute("aria-label", "Fermer le menu");
toggle.textContent = "✕";
}

toggle.addEventListener("click", () => {
const isOpen =
document.body.classList.contains("mobile-menu-open");

if (isOpen) {
  closeMenu();
} else {
  openMenu();
}

});

backdrop.addEventListener("click", closeMenu);

sidebar.querySelectorAll("a[href]").forEach(link => {
link.addEventListener("click", () => {
if (link.getAttribute("aria-disabled") !== "true") {
closeMenu();
}
});
});

document.addEventListener("keydown", event => {
if (event.key === "Escape") {
closeMenu();
}
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
initializeMobileMenu();

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
initializeFriendSuggestions(context);

} catch (error) {
console.error("Initialisation de l'espace membre :", error);

if (error.status === 401 || error.status === 403) {
  window.location.replace("connexion.html");
  return;
}

const feed = document.getElementById("feedPosts");

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
