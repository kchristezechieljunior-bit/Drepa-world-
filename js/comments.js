
/* =========================================
   DREPA-WORLD — COMMENTAIRES ET RÉACTIONS
========================================= */

export function initializeComments(context) {
  const {
    apiRequest,
    escapeHTML,
    getInitials,
    formatDate
  } = context;

  const loadedComments = new Set();
  const loadingComments = new Set();

  /* =====================================
     MESSAGES D'INFORMATION
  ===================================== */

  function showCommentMessage(container, message, type = "error") {
    if (!container) return;

    const notice = document.createElement("p");

    notice.className = `comment-message ${type}`;
    notice.textContent = message;

    container.prepend(notice);
  }

  /* =====================================
     AFFICHAGE D'UN COMMENTAIRE
  ===================================== */

  function createCommentElement(comment) {
    const element = document.createElement("div");

    element.className = "post-comment";

    const author = escapeHTML(comment.author || "Membre");
    const initials = escapeHTML(
      getInitials(comment.author || "Membre")
    );

    const date = escapeHTML(formatDate(comment.created_at));

    const content = escapeHTML(comment.content || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\n/g, "<br>");

    element.innerHTML = `
      <div class="comment-avatar">${initials}</div>

      <div class="comment-body">
        <div class="comment-bubble">
          <strong>${author}</strong>
          <p>${content}</p>
        </div>

        <div class="comment-meta">
          <span>${date}</span>
        </div>
      </div>
    `;

    return element;
  }

  /* =====================================
     CHARGEMENT DES COMMENTAIRES
  ===================================== */

  async function loadComments(postId, container) {
    const id = String(postId);

    if (!container || loadingComments.has(id)) return;

    if (loadedComments.has(id)) {
      container.hidden = !container.hidden;
      return;
    }

    loadingComments.add(id);
    container.hidden = false;

    container.innerHTML = `
      <p class="comments-empty">Chargement des commentaires...</p>
    `;

    try {
      const data = await apiRequest(
        `/posts/${encodeURIComponent(id)}/comments`
      );

      const comments = Array.isArray(data.comments)
        ? data.comments
        : [];

      container.replaceChildren();

      if (comments.length === 0) {
        const empty = document.createElement("p");

        empty.className = "comments-empty";
        empty.textContent = "Aucun commentaire pour le moment.";

        container.appendChild(empty);
      } else {
        comments.forEach(comment => {
          container.appendChild(
            createCommentElement(comment)
          );
        });
      }

      loadedComments.add(id);

    } catch (error) {
      console.error("Chargement des commentaires :", error);

      container.innerHTML = "";

      showCommentMessage(
        container,
        "Impossible de charger les commentaires."
      );

    } finally {
      loadingComments.delete(id);
    }
  }

  /* =====================================
     MISE À JOUR DU NOMBRE DE COMMENTAIRES
  ===================================== */

  function updateCommentCount(postElement, count) {
    const counter = postElement.querySelector(
      ".post-comment-count"
    );

    if (!counter) return;

    counter.textContent = count > 0
      ? `${count} commentaire(s)`
      : "";
  }

  /* =====================================
     ENVOI D'UN COMMENTAIRE
  ===================================== */

  async function submitComment(postId, postElement, input, button, container) {
    const content = input.value.trim();

    if (!content) {
      showCommentMessage(
        container,
        "Écrivez votre commentaire avant de l'envoyer."
      );

      return;
    }

    button.disabled = true;
    button.textContent = "Envoi...";

    try {
      const data = await apiRequest(
        `/posts/${encodeURIComponent(postId)}/comments`,
        {
          method: "POST",
          body: { content }
        }
      );

      input.value = "";

      loadedComments.delete(String(postId));

      const commentsData = await apiRequest(
        `/posts/${encodeURIComponent(postId)}/comments`
      );

      const comments = Array.isArray(commentsData.comments)
        ? commentsData.comments
        : [];

      container.replaceChildren();

      if (comments.length === 0) {
        const empty = document.createElement("p");

        empty.className = "comments-empty";
        empty.textContent = "Aucun commentaire pour le moment.";

        container.appendChild(empty);
      } else {
        comments.forEach(comment => {
          container.appendChild(
            createCommentElement(comment)
          );
        });
      }

      loadedComments.add(String(postId));

      const currentCount = Number(
        data.comments_count
      );

      updateCommentCount(
        postElement,
        Number.isFinite(currentCount) && currentCount >= 0
          ? currentCount
          : comments.length
      );

    } catch (error) {
      console.error("Envoi du commentaire :", error);

      showCommentMessage(
        container,
        error.message || "Impossible d'envoyer votre commentaire."
      );

    } finally {
      button.disabled = false;
      button.textContent = "Envoyer";
    }
  }

  /* =====================================
     GESTION DES RÉACTIONS
  ===================================== */

  async function sendReaction(button, postElement) {
    if (button.disabled) return;

    const postId = button.dataset.postId;
    const reaction = button.dataset.reaction;

    if (!postId || !reaction) return;

    button.disabled = true;
    button.classList.add("is-loading");

    try {
      await apiRequest(
        `/posts/${encodeURIComponent(postId)}/reactions`,
        {
          method: "POST",
          body: { reaction }
        }
      );

      button.classList.add("sent");

      const labels = {
        like: "J'aime",
        support: "Soutien envoyé",
        courage: "Courage envoyé"
      };

      const originalLabel = {
        like: "J'aime",
        support: "Soutenir",
        courage: "Courage"
      };

      button.textContent = labels[reaction] || "Envoyé";

      window.setTimeout(() => {
        button.classList.remove("sent");
        button.textContent =
          originalLabel[reaction] || "Réagir";
      }, 1800);

    } catch (error) {
      console.error("Envoi de la réaction :", error);

      button.textContent = "Réessayer";

      window.setTimeout(() => {
        button.textContent =
          reaction === "like"
            ? "J'aime"
            : reaction === "support"
              ? "Soutenir"
              : "Courage";
      }, 1800);

    } finally {
      button.disabled = false;
      button.classList.remove("is-loading");
    }
  }

  /* =====================================
     OUVERTURE DU FORMULAIRE COMMENTAIRE
  ===================================== */

  function openCommentForm(postId, postElement, container) {
    if (!container) return;

    const existingForm = container.querySelector(
      ".comment-form"
    );

    if (existingForm) {
      existingForm.querySelector("textarea")?.focus();
      return;
    }

    const form = document.createElement("form");

    form.className = "comment-form";

    form.innerHTML = `
      <textarea
        rows="2"
        maxlength="3000"
        placeholder="Écrire un commentaire..."
        aria-label="Votre commentaire"
        required
      ></textarea>

      <button type="submit" class="comment-submit">
        Envoyer
      </button>
    `;

    const textarea = form.querySelector("textarea");
    const button = form.querySelector("button");

    form.addEventListener("submit", event => {
      event.preventDefault();

      submitComment(
        postId,
        postElement,
        textarea,
        button,
        container
      );
    });

    container.appendChild(form);

    textarea.focus();
  }

  /* =====================================
     ÉVÉNEMENTS DU FIL D'ACTUALITÉ
  ===================================== */

  document.addEventListener("click", event => {
    const button = event.target.closest(
      "[data-action]"
    );

    if (!button) return;

    const action = button.dataset.action;
    const postId = button.dataset.postId;

    if (!postId) return;

    const postElement = button.closest(".post-card");

    if (!postElement) return;

    const container = postElement.querySelector(
      `[data-comments-container="${CSS.escape(String(postId))}"]`
    );

    if (action === "reaction") {
      sendReaction(button, postElement);
      return;
    }

    if (action === "comments") {
      if (!container) return;

      const isExpanded =
        button.getAttribute("aria-expanded") === "true";

      if (isExpanded) {
        button.setAttribute("aria-expanded", "false");
        container.hidden = true;
        return;
      }

      button.setAttribute("aria-expanded", "true");
      container.hidden = false;

      loadComments(postId, container);
      openCommentForm(postId, postElement, container);
    }
  });

  return {
    loadComments
  };
                  }
       
