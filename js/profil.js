
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
    value !== null &&
    value !== undefined &&
    String(value).trim() !== ""
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
   FORMULAIRE DE MODIFICATION DU PROFIL
===================================== */

function setupProfileEditor(initialProfile) {
  const editButton = document.getElementById("editProfileButton");
  const informationContainer = document.getElementById("personalInformation");

  if (!editButton || !informationContainer) return;

  let profile = { ...initialProfile };

  let formContainer = document.getElementById(
    "profileEditFormContainer"
  );

  if (!formContainer) {
    formContainer = document.createElement("div");
    formContainer.id = "profileEditFormContainer";

    informationContainer.parentNode.insertBefore(
      formContainer,
      informationContainer
    );
  }

  function showForm() {
    const fields = [
      ["city", "Ville actuelle", "text"],
      ["origin_city", "Ville d'origine", "text"],
      ["country", "Pays", "text"],
      ["birth_date", "Date de naissance", "date"],
      ["relationship_status", "Situation amoureuse", "text"],
      ["family_info", "Famille", "text"],
      ["gender", "Genre", "text"],
      ["languages", "Langues parlées", "text"]
    ];

    formContainer.innerHTML = `
      <form
        id="profileEditForm"
        class="profile-info-card"
        style="margin-bottom:20px"
      >

        <h2>Modifier mes informations personnelles</h2>

        <p>
          Tous les champs sont facultatifs.
          Tu gardes le choix des informations que tu souhaites renseigner.
        </p>

        ${fields.map(([name, label, type]) => `
          <div style="margin-bottom:14px">

            <label
              for="edit_${name}"
              style="display:block;font-weight:600;margin-bottom:6px"
            >
              ${escapeHTML(label)}
            </label>

            <input
              type="${type}"
              id="edit_${name}"
              name="${name}"
              value="${escapeHTML(profile[name] || "")}"
              ${type === "date" ? 'max="9999-12-31"' : ""}
              style="width:100%;padding:12px;border:1px solid #ccd8da;border-radius:8px;font:inherit"
            >

          </div>
        `).join("")}

        <div style="margin-bottom:14px">

          <label
            for="edit_bio"
            style="display:block;font-weight:600;margin-bottom:6px"
          >
            Ma présentation
          </label>

          <textarea
            id="edit_bio"
            name="bio"
            maxlength="1000"
            rows="4"
            style="width:100%;padding:12px;border:1px solid #ccd8da;border-radius:8px;font:inherit;resize:vertical"
          >${escapeHTML(profile.bio || "")}</textarea>

        </div>

        <p style="font-size:13px;color:#607176;line-height:1.5">
          Tes informations personnelles sont sensibles.
          Ne renseigne que ce que tu souhaites partager.
        </p>

        <div style="display:flex;gap:10px;flex-wrap:wrap">

          <button
            type="submit"
            class="profile-button profile-button-primary"
            id="saveProfileButton"
          >
            Enregistrer
          </button>

          <button
            type="button"
            class="profile-button profile-button-secondary"
            id="cancelProfileEdit"
          >
            Annuler
          </button>

        </div>

        <p
          id="profileEditMessage"
          role="status"
          aria-live="polite"
        ></p>

      </form>
    `;

    const form = document.getElementById("profileEditForm");
    const cancelButton = document.getElementById("cancelProfileEdit");
    const saveButton = document.getElementById("saveProfileButton");
    const message = document.getElementById("profileEditMessage");

    cancelButton.addEventListener("click", () => {
      formContainer.innerHTML = "";
      editButton.textContent = "Modifier mon profil";
    });

    form.addEventListener("submit", async event => {
      event.preventDefault();

      saveButton.disabled = true;
      saveButton.textContent = "Enregistrement...";
      message.textContent = "";

      const formData = new FormData(form);
      const updates = {};

      fields.forEach(([name]) => {
        const value = String(formData.get(name) || "").trim();

        updates[name] = value || null;
      });

      const bio = String(formData.get("bio") || "").trim();

      updates.bio = bio || null;

      try {
        await apiRequest("/profile", {
          method: "POST",
          body: updates
        });

        const refreshed = await apiRequest("/profile");

        profile = refreshed.profile || {
          ...profile,
          ...updates
        };

        renderPersonalInformation(profile);

        formContainer.innerHTML = "";

        editButton.textContent = "Modifier mon profil";

        const successMessage = document.createElement("p");
        successMessage.textContent =
          "Tes informations ont été mises à jour avec succès.";
        successMessage.style.color = "#087d83";
        successMessage.style.marginBottom = "15px";
        successMessage.setAttribute("role", "status");

        formContainer.appendChild(successMessage);

        window.setTimeout(() => {
          if (successMessage.isConnected) {
            successMessage.remove();
          }
        }, 5000);

      } catch (error) {
        console.error("Modification du profil :", error);

        message.textContent =
          error.message ||
          "Impossible d'enregistrer les modifications.";

        message.style.color = "#b42318";

        saveButton.disabled = false;
        saveButton.textContent = "Réessayer";
      }
    });
  }

  editButton.addEventListener("click", () => {
    if (formContainer.querySelector("#profileEditForm")) {
      formContainer.innerHTML = "";
      editButton.textContent = "Modifier mon profil";
    } else {
      showForm();
      editButton.textContent = "Fermer le formulaire";
    }
  });
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

      // Activer la modification du profil
      setupProfileEditor(profile);

    } else {
      const container = document.getElementById("personalInformation");

      if (container) {
        container.textContent =
          "Impossible de charger les informations personnelles.";
      }

      const editButton = document.getElementById("editProfileButton");

      if (editButton) {
        editButton.disabled = true;
      }
    }

    // Expériences
    if (results[1].status === "fulfilled") {
      renderExperiences(results[1].value.experiences || []);
    } else {
      const container = document.getElementById("workExperiences");

      if (container) {
        container.textContent =
          "Impossible de charger les expériences.";
      }
    }

    // Formations
    if (results[2].status === "fulfilled") {
      renderEducation(results[2].value.education || []);
    } else {
      const container = document.getElementById("educationRecords");

      if (container) {
        container.textContent =
          "Impossible de charger les formations.";
      }
    }

    // Intérêts
    if (results[3].status === "fulfilled") {
      renderInterests(results[3].value.interests || []);
    } else {
      const container = document.getElementById("memberInterests");

      if (container) {
        container.textContent =
          "Impossible de charger les centres d'intérêt.";
      }
    }

    // Amis
    if (results[4].status === "fulfilled") {
      const data = results[4].value;

      renderFriends(data.friends || [], data.friends_count);
    } else {
      const container = document.getElementById("profileFriends");

      if (container) {
        container.textContent =
          "Impossible de charger la liste des amis.";
      }
    }

    // Publications personnelles
    if (results[5].status === "fulfilled") {
      renderPosts(results[5].value.posts || []);
    } else {
      const container = document.getElementById("profilePosts");

      if (container) {
        container.textContent =
          "Impossible de charger vos publications.";
      }
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
  
