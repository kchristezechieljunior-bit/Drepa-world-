
const API_URL =
  "https://drepa-world-api.kchristezechieljunior.workers.dev";

/* =====================================
   OUTILS
===================================== */

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

function getInitials(name) {
  return String(name || "DW")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word.charAt(0).toUpperCase())
    .join("");
}

function safeUrl(value) {
  if (!value) return "";

  try {
    const url = new URL(value, API_URL);

    if (!["https:", "http:"].includes(url.protocol)) {
      return "";
    }

    return url.href;
  } catch {
    return "";
  }
}

function formatDate(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

function displayValue(value) {
  return value ? escapeHTML(value) : "Non renseigné";
}

/* =====================================
   COMMUNICATION AVEC L'API
===================================== */

async function apiRequest(path, options = {}) {
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

  let data = {};

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
    throw error;
  }

  return data;
}

/* =====================================
   AFFICHAGE DES INFORMATIONS PERSONNELLES
===================================== */

function renderPersonalInformation(profile) {
  const container = document.getElementById("personalInformation");

  if (!container) return;

  const fields = [
    ["Ville actuelle", profile.city],
    ["Ville d'origine", profile.origin_city],
    ["Pays", profile.country],
    ["Date de naissance", profile.birth_date],
    ["Situation amoureuse", profile.relationship_status],
    ["Famille", profile.family_info],
    ["Genre", profile.gender],
    ["Langues", profile.languages],
    ["Présentation", profile.bio]
  ];

  const visibleFields = fields.filter(([, value]) =>
    value !== null && value !== undefined && String(value).trim() !== ""
  );

  if (!visibleFields.length) {
    container.innerHTML = `
      <p class="profile-page-message">
        Aucune information personnelle renseignée pour le moment.
      </p>
    `;
    return;
  }

  container.innerHTML = visibleFields.map(([label, value]) => {
    let formattedValue = value;

    if (label === "Date de naissance") {
      formattedValue = formatDate(value);
    }

    return `
      <div class="profile-detail">
        <strong>${escapeHTML(label)}</strong>
        <span>${escapeHTML(formattedValue)}</span>
      </div>
    `;
  }).join("");
}

/* =====================================
   EXPÉRIENCES PROFESSIONNELLES
===================================== */

function renderExperiences(experiences) {
  const container = document.getElementById("workExperiences");

  if (!container) return;

  if (!experiences.length) {
    container.innerHTML =
      "<p>Aucune expérience professionnelle renseignée.</p>";
    return;
  }

  container.innerHTML = experiences.map(item => `
    <article class="profile-friend">
      <h3>${displayValue(item.position)}</h3>
      <strong>${displayValue(item.company)}</strong>
      <p>${displayValue(item.location)}</p>
      <p>
        ${displayValue(item.start_date)}
        –
        ${item.is_current ? "Aujourd'hui" : displayValue(item.end_date)}
      </p>
      ${item.description
        ? `<p>${escapeHTML(item.description)}</p>`
        : ""}
    </article>
  `).join("");
}

/* =====================================
   FORMATIONS
===================================== */

function renderEducation(records) {
  const container = document.getElementById("educationRecords");

  if (!container) return;

  if (!records.length) {
    container.innerHTML =
      "<p>Aucune formation renseignée.</p>";
    return;
  }

  container.innerHTML = records.map(item => `
    <article class="profile-friend">
      <h3>${displayValue(item.institution)}</h3>
      <strong>${displayValue(item.education_level)}</strong>
      <p>${displayValue(item.field_of_study)}</p>
      <p>${displayValue(item.location)}</p>
      <p>
        ${displayValue(item.start_year)}
        –
        ${displayValue(item.end_year)}
      </p>
      ${item.description
        ? `<p>${escapeHTML(item.description)}</p>`
        : ""}
    </article>
  `).join("");
}

/* =====================================
   LOISIRS ET CENTRES D'INTÉRÊT
===================================== */

function renderInterests(interests) {
  const container = document.getElementById("memberInterests");

  if (!container) return;

  if (!interests.length) {
    container.innerHTML =
      "<p>Aucun centre d'intérêt renseigné.</p>";
    return;
  }

  const categories = {
    loisirs: "Loisirs",
    musique: "Musique",
    series: "Séries télévisées",
    films: "Films",
    jeux: "Jeux",
    equipes_sportives: "Équipes sportives"
  };

  container.innerHTML = interests.map(item => `
    <article class="profile-friend">
      <strong>
        ${escapeHTML(categories[item.category] || item.category || "Intérêt")}
      </strong>
      <p>${displayValue(item.interest_name)}</p>
      ${item.description
        ? `<p>${escapeHTML(item.description)}</p>`
        : ""}
    </article>
  `).join("");
}

/* =====================================
   AMIS
===================================== */

function renderFriends(friends, count) {
  const container = document.getElementById("profileFriends");
  const counter = document.getElementById("friendsCount");

  if (counter) {
    counter.textContent = String(Number(count) || friends.length);
  }

  if (!container) return;

  if (!friends.length) {
    container.innerHTML = "<p>Vous n'avez pas encore d'amis.</p>";
    return;
  }

  container.innerHTML = friends.map(friend => {
    const name = friend.username || friend.name || "Membre";
    const photo = safeUrl(friend.photo_url);

    const avatar = photo
      ? `<img src="${escapeHTML(photo)}"
              alt=""
              style="width:45px;height:45px;border-radius:50%;object-fit:cover">`
      : `<span class="profile-page-avatar"
                style="width:45px;height:45px;font-size:16px">
           ${escapeHTML(getInitials(name))}
         </span>`;

    return `
      <article class="profile-friend"
               style="display:flex;align-items:center;gap:12px">
        ${avatar}
        <strong>${escapeHTML(name)}</strong>
      </article>
    `;
  }).join("");
}

/* =====================================
   PUBLICATIONS PERSONNELLES
===================================== */

function renderPosts(posts) {
  const container = document.getElementById("profilePosts");

  if (!container) return;

  if (!posts.length) {
    container.innerHTML =
      "<p>Vous n'avez pas encore publié de contenu.</p>";
    return;
  }

  container.innerHTML = posts.map(post => {
    const content = escapeHTML(post.content || "");
    const media = safeUrl(post.media_url);

    let mediaHTML = "";

    if (media && post.media_type) {
      if (String(post.media_type).startsWith("image/")) {
        mediaHTML = `
          <img
            src="${escapeHTML(media)}"
            alt="Média de la publication"
            loading="lazy"
            style="width:100%;max-height:420px;object-fit:contain;border-radius:12px"
          >
        `;
      } else if (String(post.media_type).startsWith("video/")) {
        mediaHTML = `
          <video
            src="${escapeHTML(media)}"
            controls
            preload="metadata"
            style="width:100%;max-height:420px;border-radius:12px"
          ></video>
        `;
      }
    }

    return `
      <article class="profile-friend">
        <p>${content}</p>
        ${mediaHTML}
        <small>${escapeHTML(formatDate(post.created_at))}</small>
        <p>
          ${Number(post.reactions_count) || 0} réactions ·
          ${Number(post.comments_count) || 0} commentaires
        </p>
      </article>
    `;
  }).join("");
}

/* =====================================
   CHARGEMENT DU PROFIL
===================================== */

async function initializeProfile() {
  const logoutButton = document.getElementById("logoutButton");

  if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
      logoutButton.disabled = true;
      logoutButton.textContent = "Déconnexion...";

      try {
        await apiRequest("/logout", {
          method: "POST",
          body: {}
        });
      } catch (error) {
        console.error("Déconnexion :", error);
      }

      window.location.replace("connexion.html");
    });
  }

  try {
    // Vérifier la session
    const me = await apiRequest("/me");

    if (!me.member || !me.member.username) {
      throw new Error("Session invalide.");
    }

    const member = me.member;

    // Charger les informations du profil et les autres données
    const results = await Promise.allSettled([
      apiRequest("/profile"),
      apiRequest("/work-experiences"),
      apiRequest("/education"),
      apiRequest("/interests"),
      apiRequest("/friends"),
      apiRequest(
        `/posts?limit=10&member_id=${encodeURIComponent(member.id)}`
      )
    ]);

    // Identité
    const profileName = document.getElementById("profileUsername");

    if (profileName) {
      profileName.textContent = member.username;
    }

    document.title = `${member.username} | DREPA-WORLD`;

    // Informations personnelles
    if (results[0].status === "fulfilled") {
      const profile = results[0].value.profile || {};

      if (profileName && profile.username) {
        profileName.textContent = profile.username;
      }

      const avatar = document.getElementById("profileAvatar");
      const photo = safeUrl(profile.photo_url);

      if (avatar) {
        if (photo) {
          avatar.innerHTML = `
            <img
              src="${escapeHTML(photo)}"
              alt="Photo de profil"
              style="width:100%;height:100%;object-fit:cover;border-radius:50%"
            >
          `;
        } else {
          avatar.textContent = getInitials(
            profile.username || member.username
          );
        }
      }

      renderPersonalInformation(profile);
    } else {
      document.getElementById("personalInformation").textContent =
        "Impossible de charger les informations personnelles.";
    }

    // Expériences
    if (results[1].status === "fulfilled") {
      renderExperiences(results[1].value.experiences || []);
    } else {
      document.getElementById("workExperiences").textContent =
        "Impossible de charger les expériences.";
    }

    // Formations
    if (results[2].status === "fulfilled") {
      renderEducation(results[2].value.education || []);
    } else {
      document.getElementById("educationRecords").textContent =
        "Impossible de charger les formations.";
    }

    // Intérêts
    if (results[3].status === "fulfilled") {
      renderInterests(results[3].value.interests || []);
    } else {
      document.getElementById("memberInterests").textContent =
        "Impossible de charger les centres d'intérêt.";
    }

    // Amis
    if (results[4].status === "fulfilled") {
      const data = results[4].value;

      renderFriends(data.friends || [], data.friends_count);
    } else {
      document.getElementById("profileFriends").textContent =
        "Impossible de charger la liste des amis.";
    }

    // Publications personnelles
    if (results[5].status === "fulfilled") {
      renderPosts(results[5].value.posts || []);
    } else {
      document.getElementById("profilePosts").textContent =
        "Impossible de charger vos publications.";
    }

  } catch (error) {
    console.error("Chargement du profil :", error);

    if (error.status === 401 || error.status === 403) {
      window.location.replace("connexion.html");
      return;
    }

    const name = document.getElementById("profileUsername");

    if (name) {
      name.textContent = "Profil indisponible";
    }
  }
}

initializeProfile();
                                     
