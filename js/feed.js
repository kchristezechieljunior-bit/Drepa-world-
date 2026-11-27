/* =========================================
   DREPA-WORLD — FIL D'ACTUALITÉ
========================================= */

export function initializeFeed(context) {
  const {
    API_URL,
    PAGE_SIZE,
    MAX_IMAGE_SIZE,
    MAX_VIDEO_SIZE,
    apiRequest,
    escapeHTML,
    getInitials,
    formatDate,
    showMessage
  } = context;

  const feed = document.getElementById("feed");
  const feedLoading = document.getElementById("feedLoading");
  const feedSentinel = document.getElementById("feedSentinel");
  const feedStatus = document.getElementById("feedStatus");
  const loadMoreButton = document.getElementById("loadMoreButton");

  const postForm = document.getElementById("postForm");
  const postContent = document.getElementById("postContent");
  const mediaInput = document.getElementById("mediaInput");
  const selectedMediaName = document.getElementById("selectedMediaName");
  const removeMediaButton = document.getElementById("removeMediaButton");
  const publishButton = document.getElementById("publishButton");
  const refreshButton = document.getElementById("refreshFeed");
  const formMessage = document.getElementById("formMessage");

  let nextCursor = null;
  let hasMore = true;
  let isLoading = false;
  let isPublishing = false;
  let observer = null;

  const mediaObjectURLs = new Map();

  /* =====================================
     AFFICHAGE DES MESSAGES
  ===================================== */

  function setFeedStatus(message) {
    if (feedStatus) {
      feedStatus.textContent = message || "";
    }
  }

  function setLoading(loading) {
    if (feedLoading) {
      feedLoading.hidden = !loading;
    }
  }

  /* =====================================
     GESTION DES FICHIERS
  ===================================== */

  function validateMedia(file) {
    if (!file) return null;

    const imageTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif"
    ];

    const videoTypes = [
      "video/mp4",
      "video/webm",
      "video/quicktime"
    ];

    if (imageTypes.includes(file.type)) {
      if (file.size > MAX_IMAGE_SIZE) {
        return "Cette image dépasse la limite de 8 Mo.";
      }

      return null;
    }

    if (videoTypes.includes(file.type)) {
      if (file.size > MAX_VIDEO_SIZE) {
        return "Cette vidéo dépasse la limite de 50 Mo.";
      }

      return null;
    }

    return "Format non accepté. Utilisez une image JPEG, PNG, WEBP, GIF ou une vidéo MP4, WEBM ou MOV.";
  }

  function updateSelectedMedia() {
    if (!mediaInput || !selectedMediaName) return;

    const file = mediaInput.files?.[0];

    if (!file) {
      selectedMediaName.textContent = "";
      selectedMediaName.hidden = true;

      if (removeMediaButton) {
        removeMediaButton.hidden = true;
      }

      return;
    }

    const error = validateMedia(file);

    if (error) {
      showMessage(formMessage, error, "error");
      mediaInput.value = "";
      updateSelectedMedia();
      return;
    }

    selectedMediaName.textContent = file.name;
    selectedMediaName.hidden = false;

    if (removeMediaButton) {
      removeMediaButton.hidden = false;
    }

    if (formMessage) {
      formMessage.textContent = "";
    }
  }

  function removeSelectedMedia() {
    if (mediaInput) {
      mediaInput.value = "";
    }

    updateSelectedMedia();
  }

  /* =====================================
     MÉDIAS DES PUBLICATIONS
  ===================================== */

  async function loadPostMedia(post, container) {
    if (!post.media_url || !container) return;

    try {
      const response = await fetch(
        `${API_URL}${post.media_url}`,
        {
          method: "GET",
          credentials: "include"
        }
      );

      if (!response.ok) {
        throw new Error("Média indisponible.");
      }

      const blob = await response.blob();
      const objectURL = URL.createObjectURL(blob);

      mediaObjectURLs.set(container, objectURL);

      if (blob.type.startsWith("video/")) {
        const video = document.createElement("video");

        video.src = objectURL;
        video.controls = true;
        video.preload = "metadata";
        video.playsInline = true;
        video.className = "post-media-video";

        container.replaceChildren(video);
      } else if (blob.type.startsWith("image/")) {
        const image = document.createElement("img");

        image.src = objectURL;
        image.alt = "Média partagé dans une publication";
        image.loading = "lazy";
        image.className = "post-media-image";

        container.replaceChildren(image);
      } else {
        URL.revokeObjectURL(objectURL);
        mediaObjectURLs.delete(container);
        container.textContent = "Ce média ne peut pas être affiché.";
      }

    } catch (error) {
      console.error("Chargement du média :", error);
      container.textContent = "Impossible de charger ce média.";
    }
  }

  /* =====================================
     CRÉATION D'UNE PUBLICATION
  ===================================== */

  function createPostElement(post) {
    const article = document.createElement("article");

    article.className = "post-card";
    article.dataset.postId = String(post.id);

    const author = escapeHTML(post.author || "Membre");
    const initials = escapeHTML(getInitials(post.author || "Membre"));
    const date = escapeHTML(formatDate(post.created_at));

    const content = escapeHTML(post.content || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\n/g, "<br>");

    const commentsCount = Number(post.comments_count) || 0;
    const reactionsCount = Number(post.reactions_count) || 0;

    article.innerHTML = `
      <div class="post-header">
        <div class="post-avatar">${initials}</div>

        <div class="post-author-info">
          <strong class="post-author">${author}</strong>
          <span class="post-date">${date}</span>
        </div>
      </div>

      <div class="post-content">${content}</div>

      ${
        post.media_url
          ? `<div class="post-media post-media-loading" aria-label="Média de la publication">
               Chargement du média...
             </div>`
          : ""
      }

      <div class="post-statistics">
        <span class="post-like-count">
          ${reactionsCount > 0 ? `${reactionsCount} réaction(s)` : ""}
        </span>

        <span class="post-comment-count">
          ${commentsCount > 0 ? `${commentsCount} commentaire(s)` : ""}
        </span>
      </div>

      <div class="post-actions">
        <button
          type="button"
          class="post-action reaction-button"
          data-action="reaction"
          data-reaction="like"
          data-post-id="${escapeHTML(post.id)}"
        >
          J'aime
        </button>

        <button
          type="button"
          class="post-action reaction-button"
          data-action="reaction"
          data-reaction="support"
          data-post-id="${escapeHTML(post.id)}"
        >
          Soutenir
        </button>

        <button
          type="button"
          class="post-action reaction-button"
          data-action="reaction"
          data-reaction="courage"
          data-post-id="${escapeHTML(post.id)}"
        >
          Courage
        </button>

        <button
          type="button"
          class="post-action comment-button"
          data-action="comments"
          data-post-id="${escapeHTML(post.id)}"
          aria-expanded="false"
        >
          Commenter
        </button>
      </div>

      <div
        class="post-comments-container"
        data-comments-container="${escapeHTML(post.id)}"
      ></div>
    `;

    if (post.media_url) {
      const mediaContainer = article.querySelector(".post-media");

      loadPostMedia(post, mediaContainer);
    }

    return article;
  }

  /* =====================================
     NETTOYAGE DES ANCIENS MÉDIAS
  ===================================== */

  function clearFeed() {
    if (!feed) return;

    mediaObjectURLs.forEach(url => {
      URL.revokeObjectURL(url);
    });

    mediaObjectURLs.clear();
    feed.replaceChildren();
  }

  /* =====================================
     CHARGEMENT DES PUBLICATIONS
  ===================================== */

  async function loadFeed(reset = false) {
    if (!feed || isLoading) return;

    if (!hasMore && !reset) return;

    isLoading = true;
    setLoading(true);
    setFeedStatus("");

    if (loadMoreButton) {
      loadMoreButton.disabled = true;
      loadMoreButton.hidden = true;
    }

    if (reset) {
      nextCursor = null;
      hasMore = true;
      clearFeed();
    }

    try {
      let url = `/posts?limit=${PAGE_SIZE}`;

      if (nextCursor) {
        url += `&cursor=${encodeURIComponent(nextCursor)}`;
      }

      const data = await apiRequest(url);

      const posts = Array.isArray(data.posts)
        ? data.posts
        : [];

      posts.forEach(post => {
        feed.appendChild(createPostElement(post));
      });

      hasMore = Boolean(data.hasMore);
      nextCursor = data.nextCursor || null;

      if (posts.length === 0 && reset) {
        feed.innerHTML = `
          <div class="feed-empty">
            <h3>Bienvenue dans votre fil d'actualité</h3>
            <p>
              Aucune publication pour le moment.
              Vous pouvez partager votre première expérience
              avec la communauté.
            </p>
          </div>
        `;
      }

      if (!hasMore) {
        setFeedStatus(
          posts.length > 0
            ? "Vous êtes à jour."
            : ""
        );
      }

      if (hasMore && loadMoreButton) {
        loadMoreButton.hidden = false;
      }

    } catch (error) {
      console.error("Chargement du fil :", error);

      setFeedStatus(
        "Impossible de charger les publications. Veuillez réessayer."
      );

      if (loadMoreButton) {
        loadMoreButton.hidden = false;
      }

    } finally {
      isLoading = false;
      setLoading(false);

      if (loadMoreButton) {
        loadMoreButton.disabled = false;
      }
    }
  }

  /* =====================================
     PUBLICATION D'UN MESSAGE
  ===================================== */

  async function publishPost(event) {
    event.preventDefault();

    if (isPublishing || !postContent) return;

    const content = postContent.value.trim();
    const file = mediaInput?.files?.[0] || null;

    if (!content && !file) {
      showMessage(
        formMessage,
        "Écrivez un message ou choisissez un média.",
        "error"
      );

      return;
    }

    if (file) {
      const error = validateMedia(file);

      if (error) {
        showMessage(formMessage, error, "error");
        return;
      }
    }

    isPublishing = true;

    if (publishButton) {
      publishButton.disabled = true;
      publishButton.textContent = "Publication...";
    }

    try {
      let body;

      if (file) {
        body = new FormData();
        body.append("content", content);
        body.append("media", file);
      } else {
        body = { content };
      }

      await apiRequest("/posts", {
        method: "POST",
        body
      });

      postContent.value = "";
      removeSelectedMedia();

      showMessage(
        formMessage,
        "Votre publication a été partagée.",
        "success"
      );

      await loadFeed(true);

    } catch (error) {
      console.error("Publication :", error);

      showMessage(
        formMessage,
        error.message || "Impossible de publier votre message.",
        "error"
      );

    } finally {
      isPublishing = false;

      if (publishButton) {
        publishButton.disabled = false;
        publishButton.textContent = "Publier";
      }
    }
  }

  /* =====================================
     ÉVÉNEMENTS
  ===================================== */

  if (postForm) {
    postForm.addEventListener("submit", publishPost);
  }

  if (mediaInput) {
    mediaInput.addEventListener("change", updateSelectedMedia);
  }

  if (removeMediaButton) {
    removeMediaButton.addEventListener(
      "click",
      removeSelectedMedia
    );
  }

  if (refreshButton) {
    refreshButton.addEventListener("click", () => {
      loadFeed(true);
    });
  }

  if (loadMoreButton) {
    loadMoreButton.addEventListener("click", () => {
      loadFeed(false);
    });
  }

  /* =====================================
     CHARGEMENT AUTOMATIQUE
  ===================================== */

  if ("IntersectionObserver" in window && feedSentinel) {
    observer = new IntersectionObserver(entries => {
      const entry = entries[0];

      if (entry.isIntersecting && hasMore && !isLoading) {
        loadFeed(false);
      }
    }, {
      rootMargin: "300px"
    });

    observer.observe(feedSentinel);
  }

  /* =====================================
     PREMIER CHARGEMENT
  ===================================== */

  loadFeed(true);

  return {
    refreshFeed: () => loadFeed(true),
    loadMore: () => loadFeed(false)
  };
}
