
/* =========================================================
   DREPA-WORLD — FIL D'ACTUALITÉ
   Publications, médias et pagination
   ========================================================= */

export function initializeFeed(context) {
    const {
        API_URL,
        apiRequest,
        escapeHTML,
        getInitials,
        formatDate,
        showMessage
    } = context;

    const PAGE_SIZE = 10;
    const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
    const MAX_VIDEO_SIZE = 50 * 1024 * 1024;

    let nextCursor = null;
    let hasMore = true;
    let isLoading = false;
    let isPublishing = false;
    let observer = null;

    const mediaUrls = new Set();

    /* ---------- ÉLÉMENTS HTML ---------- */

    function findElement(ids) {
        for (const id of ids) {
            const element = document.getElementById(id);
            if (element) return element;
        }
        return null;
    }

    const postForm = findElement([
        "postForm",
        "publicationForm",
        "createPostForm"
    ]);

    const postContent = findElement([
        "postContent",
        "postText",
        "publicationContent"
    ]);

    const mediaInput = findElement([
        "mediaInput",
        "postMedia",
        "mediaFile"
    ]);

    const imageInput = findElement(["imageInput"]);
    const videoInput = findElement(["videoInput"]);

    const publishButton = findElement([
        "publishButton",
        "submitPost",
        "postSubmit"
    ]);

    const postsContainer = findElement([
        "postsContainer",
        "postsList",
        "feedPosts",
        "feed"
    ]);

    const loadMoreButton = findElement([
        "loadMoreButton",
        "loadMore",
        "loadMorePosts"
    ]);

    const feedStatus = findElement([
        "feedStatus",
        "postsStatus"
    ]);

    const mediaPreview = findElement([
        "mediaPreview",
        "selectedMedia"
    ]);

    /* ---------- ÉTAT DU FIL ---------- */

    function setStatus(message, type = "") {
        if (!feedStatus) return;

        feedStatus.textContent = message;
        feedStatus.className = "feed-status";

        if (type) {
            feedStatus.classList.add(type);
        }

        feedStatus.hidden = !message;
    }

    function setPublishingState(value) {
        isPublishing = value;

        if (publishButton) {
            publishButton.disabled = value;
            publishButton.textContent = value
                ? "Publication en cours..."
                : "Publier";
        }
    }

    /* ---------- MÉDIAS ---------- */

    function getSelectedFile() {
        return (
            mediaInput?.files?.[0] ||
            imageInput?.files?.[0] ||
            videoInput?.files?.[0] ||
            null
        );
    }

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
                return "L'image ne doit pas dépasser 8 Mo.";
            }
            return null;
        }

        if (videoTypes.includes(file.type)) {
            if (file.size > MAX_VIDEO_SIZE) {
                return "La vidéo ne doit pas dépasser 50 Mo.";
            }
            return null;
        }

        return "Format non accepté. Utilise une image JPEG, PNG, WEBP, GIF ou une vidéo MP4, WEBM ou MOV.";
    }

    function clearMediaSelection() {
        [mediaInput, imageInput, videoInput].forEach(input => {
            if (input) input.value = "";
        });

        if (mediaPreview) {
            mediaPreview.innerHTML = "";
            mediaPreview.hidden = true;
        }
    }

    function previewSelectedMedia(file) {
        if (!mediaPreview) return;

        mediaPreview.innerHTML = "";
        mediaPreview.hidden = false;

        const url = URL.createObjectURL(file);
        mediaUrls.add(url);

        let preview;

        if (file.type.startsWith("image/")) {
            preview = document.createElement("img");
            preview.alt = "Aperçu de l'image sélectionnée";
        } else {
            preview = document.createElement("video");
            preview.controls = true;
        }

        preview.src = url;
        preview.style.maxWidth = "100%";
        preview.style.maxHeight = "240px";

        mediaPreview.appendChild(preview);

        const name = document.createElement("p");
        name.textContent = file.name;
        mediaPreview.appendChild(name);
    }

    function initializeMediaInputs() {
        [mediaInput, imageInput, videoInput].forEach(input => {
            if (!input) return;

            input.addEventListener("change", () => {
                const file = input.files?.[0];

                if (!file) return;

                const error = validateMedia(file);

                if (error) {
                    alert(error);
                    clearMediaSelection();
                    return;
                }

                previewSelectedMedia(file);
            });
        });
    }

    /* ---------- CHARGEMENT DES MÉDIAS DES PUBLICATIONS ---------- */

    async function attachPostMedia(post, container) {
        if (!post.media_url || !container) return;

        try {
            const mediaPath = new URL(post.media_url, API_URL);

            if (mediaPath.origin !== new URL(API_URL).origin) {
                return;
            }

            const response = await fetch(mediaPath.href, {
                credentials: "include"
            });

            if (!response.ok) {
                throw new Error("Média indisponible.");
            }

            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);

            mediaUrls.add(objectUrl);

            const media = document.createElement(
                blob.type.startsWith("video/") ? "video" : "img"
            );

            media.src = objectUrl;

            if (media.tagName === "VIDEO") {
                media.controls = true;
                media.preload = "metadata";
            } else {
                media.alt = "Média publié sur DREPA-WORLD";
                media.loading = "lazy";
            }

            const wrapper = document.createElement("div");
            wrapper.className = "post-media";
            wrapper.appendChild(media);

            container.replaceChildren(wrapper);

        } catch (error) {
            console.error("Chargement du média impossible :", error);
        }
    }

    /* ---------- AFFICHAGE D'UNE PUBLICATION ---------- */

    function renderPost(post) {
        const article = document.createElement("article");

        article.className = "post-card";
        article.dataset.postId = String(post.id);

        const author = escapeHTML(
            post.author || "Membre DREPA-WORLD"
        );

        const initials = escapeHTML(getInitials(post.author));
        const content = escapeHTML(post.content || "");
        const date = escapeHTML(formatDate(post.created_at));

        const likes = Number(post.likes_count) || 0;
        const comments = Number(post.comments_count) || 0;

        article.innerHTML = `
            <div class="post-header">
                <div class="post-author">
                    <div class="avatar">${initials}</div>

                    <div class="post-author-info">
                        <strong>${author}</strong>
                        <span class="post-date">${date}</span>
                    </div>
                </div>
            </div>

            <p class="post-content">${content}</p>

            <div class="post-media-placeholder"></div>

            <div class="post-stats">
                <span data-likes-count>${likes} réaction${likes > 1 ? "s" : ""}</span>
                <span data-comments-count>${comments} commentaire${comments > 1 ? "s" : ""}</span>
            </div>

            <div class="post-actions">
                <button type="button"
                    class="post-action reaction-button"
                    data-reaction="like">
                    J'aime
                </button>

                <button type="button"
                    class="post-action reaction-button"
                    data-reaction="support">
                    Soutenir
                </button>

                <button type="button"
                    class="post-action reaction-button"
                    data-reaction="courage">
                    Courage
                </button>

                <button type="button"
                    class="post-action"
                    data-comment-toggle>
                    Commenter
                </button>
            </div>

            <section class="comments-section" data-comments-section>
                <div class="comments-list" data-comments-list>
                    <p class="comments-empty">
                        Les commentaires apparaîtront ici.
                    </p>
                </div>

                <form class="comment-form" data-comment-form>
                    <input
                        type="text"
                        name="content"
                        placeholder="Écrire un commentaire..."
                        maxlength="2000"
                        required
                        autocomplete="off"
                    >

                    <button type="submit">Envoyer</button>
                </form>
            </section>
        `;

        if (post.media_url) {
            const placeholder = article.querySelector(
                ".post-media-placeholder"
            );

            attachPostMedia(post, placeholder);
        }

        return article;
    }

    /* ---------- CHARGEMENT DES PUBLICATIONS ---------- */

    async function loadPosts(reset = false) {
        if (isLoading) return;

        if (!reset && !hasMore) return;

        if (!postsContainer) {
            setStatus("Impossible de trouver la zone des publications.", "error");
            return;
        }

        isLoading = true;

        if (reset) {
            nextCursor = null;
            hasMore = true;
            postsContainer.innerHTML = "";
            setStatus("Chargement des publications...");
        } else {
            setStatus("Chargement des publications...");
        }

        if (loadMoreButton) {
            loadMoreButton.disabled = true;
        }

        try {
            const params = new URLSearchParams();
            params.set("limit", String(PAGE_SIZE));

            if (nextCursor !== null && nextCursor !== undefined) {
                params.set("cursor", String(nextCursor));
            }

            const data = await apiRequest(
                "/posts?" + params.toString()
            );

            const posts = Array.isArray(data.posts)
                ? data.posts
                : [];

            posts.forEach(post => {
                postsContainer.appendChild(renderPost(post));
            });

            hasMore = Boolean(data.hasMore);
            nextCursor = data.nextCursor ?? null;

            if (reset && posts.length === 0) {
                setStatus("Aucune publication pour le moment.");
            } else if (hasMore) {
                setStatus("");
            } else {
                setStatus(
                    posts.length
                        ? "Vous avez atteint la fin du fil d'actualité."
                        : "Aucune publication pour le moment."
                );
            }

            if (loadMoreButton) {
                loadMoreButton.hidden = !hasMore;
            }

        } catch (error) {
            console.error("Erreur de chargement du fil :", error);

            setStatus(
                error.message || "Impossible de charger les publications.",
                "error"
            );

        } finally {
            isLoading = false;

            if (loadMoreButton) {
                loadMoreButton.disabled = false;
            }
        }
    }

    /* ---------- PUBLICATION ---------- */

    async function submitPost(event) {
        event.preventDefault();

        if (isPublishing) return;

        const content = postContent?.value.trim() || "";
        const file = getSelectedFile();

        if (!content && !file) {
            alert("Écris un message ou sélectionne un média avant de publier.");
            return;
        }

        if (file) {
            const error = validateMedia(file);

            if (error) {
                alert(error);
                return;
            }
        }

        const formData = new FormData();
        formData.append("content", content);

        if (file) {
            formData.append("media", file);
        }

        setPublishingState(true);

        try {
            await apiRequest("/posts", {
                method: "POST",
                body: formData
            });

            if (postContent) {
                postContent.value = "";
            }

            clearMediaSelection();

            await loadPosts(true);

        } catch (error) {
            console.error("Erreur de publication :", error);

            alert(
                error.message ||
                "La publication n'a pas pu être envoyée."
            );

        } finally {
            setPublishingState(false);
        }
    }

    /* ---------- PAGINATION AUTOMATIQUE ---------- */

    function setupFeedObserver() {
        const sentinel = findElement([
            "feedSentinel",
            "loadMoreTrigger",
            "postsSentinel"
        ]);

        if (!sentinel || !("IntersectionObserver" in window)) {
            return;
        }

        observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting && hasMore && !isLoading) {
                    loadPosts(false);
                }
            });
        }, {
            rootMargin: "300px"
        });

        observer.observe(sentinel);
    }

    /* ---------- ÉVÉNEMENTS ---------- */

    function initializeEvents() {
        if (postForm) {
            postForm.addEventListener("submit", submitPost);
        } else if (publishButton) {
            publishButton.addEventListener("click", submitPost);
        }

        if (loadMoreButton) {
            loadMoreButton.addEventListener("click", () => {
                loadPosts(false);
            });
        }

        initializeMediaInputs();
        setupFeedObserver();
    }

    /* ---------- NETTOYAGE ---------- */

    function cleanup() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }

        mediaUrls.forEach(url => {
            URL.revokeObjectURL(url);
        });

        mediaUrls.clear();
    }

    /* ---------- DÉMARRAGE DU MODULE ---------- */

    initializeEvents();

    return {
        loadPosts,
        cleanup
    };
      }
         
