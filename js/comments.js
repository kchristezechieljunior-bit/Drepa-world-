
/* =========================================================
   DREPA-WORLD — RÉACTIONS ET COMMENTAIRES
   ========================================================= */

export function initializeComments(context) {
    const {
        apiRequest,
        escapeHTML,
        getInitials,
        formatDate,
        loadPosts
    } = context;

    const loadingComments = new Set();
    const sendingComments = new Set();
    const sendingReactions = new Set();

    /* ---------- OUTILS ---------- */

    function getPostId(element) {
        const article = element.closest("[data-post-id]");

        if (!article) return null;

        const id = article.dataset.postId;

        return id ? String(id) : null;
    }

    function getPostElement(postId) {
        return document.querySelector(
            `[data-post-id="${CSS.escape(String(postId))}"]`
        );
    }

    function getCommentList(postElement) {
        return postElement?.querySelector("[data-comments-list]");
    }

    function showCommentMessage(list, message, type = "") {
        if (!list) return;

        const paragraph = document.createElement("p");
        paragraph.className = type || "comments-empty";
        paragraph.textContent = message;

        list.replaceChildren(paragraph);
    }

    /* ---------- AFFICHAGE D'UN COMMENTAIRE ---------- */

    function renderComment(comment) {
        const item = document.createElement("div");

        item.className = "comment-item";

        const author =
            comment.author ||
            comment.username ||
            comment.pseudonym ||
            "Membre";

        const content =
            comment.content ||
            "";

        const date = formatDate(comment.created_at);

        item.innerHTML = `
            <div class="comment-avatar">
                ${escapeHTML(getInitials(author))}
            </div>

            <div class="comment-body">
                <div class="comment-meta">
                    <strong>${escapeHTML(author)}</strong>
                    <span>${escapeHTML(date)}</span>
                </div>

                <p class="comment-content">${escapeHTML(content)}</p>
            </div>
        `;

        return item;
    }

    /* ---------- CHARGEMENT DES COMMENTAIRES ---------- */

    async function loadComments(postId) {
        const postElement = getPostElement(postId);

        if (!postElement) return;

        const list = getCommentList(postElement);

        if (!list || loadingComments.has(postId)) return;

        loadingComments.add(postId);

        showCommentMessage(list, "Chargement des commentaires...");

        try {
            const data = await apiRequest(
                `/posts/${encodeURIComponent(postId)}/comments`
            );

            const comments = Array.isArray(data.comments)
                ? data.comments
                : [];

            list.replaceChildren();

            if (comments.length === 0) {
                showCommentMessage(
                    list,
                    "Aucun commentaire pour le moment."
                );
                return;
            }

            comments.forEach(comment => {
                list.appendChild(renderComment(comment));
            });

        } catch (error) {
            console.error(
                "Erreur de chargement des commentaires :",
                error
            );

            showCommentMessage(
                list,
                error.message || "Impossible de charger les commentaires.",
                "comments-error"
            );

        } finally {
            loadingComments.delete(postId);
        }
    }

    /* ---------- MISE À JOUR DU NOMBRE DE COMMENTAIRES ---------- */

    function updateCommentCount(postElement) {
        const counter = postElement?.querySelector(
            "[data-comments-count]"
        );

        if (!counter) return;

        const currentText = counter.textContent || "";
        const match = currentText.match(/\d+/);
        const currentCount = match ? Number(match[0]) : 0;
        const newCount = currentCount + 1;

        counter.textContent =
            `${newCount} commentaire${newCount > 1 ? "s" : ""}`;
    }

    /* ---------- ENVOI D'UN COMMENTAIRE ---------- */

    async function submitComment(form) {
        const postElement = form.closest("[data-post-id]");

        if (!postElement) return;

        const postId = String(postElement.dataset.postId);

        if (sendingComments.has(postId)) return;

        const input = form.querySelector(
            'input[name="content"], textarea[name="content"]'
        );

        if (!input) return;

        const content = input.value.trim();

        if (!content) {
            input.focus();
            return;
        }

        if (content.length > 2000) {
            alert("Ton commentaire ne doit pas dépasser 2 000 caractères.");
            return;
        }

        const submitButton = form.querySelector(
            'button[type="submit"]'
        );

        sendingComments.add(postId);

        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = "Envoi...";
        }

        try {
            await apiRequest(
                `/posts/${encodeURIComponent(postId)}/comments`,
                {
                    method: "POST",
                    body: { content }
                }
            );

            input.value = "";

            updateCommentCount(postElement);

            await loadComments(postId);

        } catch (error) {
            console.error(
                "Erreur d'envoi du commentaire :",
                error
            );

            alert(
                error.message ||
                "Impossible d'envoyer ce commentaire."
            );

        } finally {
            sendingComments.delete(postId);

            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = "Envoyer";
            }
        }
    }

    /* ---------- RÉACTIONS ---------- */

    async function sendReaction(button) {
        const postElement = button.closest("[data-post-id]");

        if (!postElement) return;

        const postId = String(postElement.dataset.postId);
        const reaction = button.dataset.reaction;

        const allowedReactions = [
            "like",
            "support",
            "courage"
        ];

        if (!allowedReactions.includes(reaction)) {
            return;
        }

        const reactionKey = `${postId}:${reaction}`;

        if (sendingReactions.has(reactionKey)) return;

        sendingReactions.add(reactionKey);

        button.disabled = true;

        try {
            await apiRequest(
                `/posts/${encodeURIComponent(postId)}/reactions`,
                {
                    method: "POST",
                    body: { reaction }
                }
            );

            /*
             * L'API confirme l'action.
             * On ne marque pas une réaction comme active
             * car l'état personnel n'est pas fourni par GET /posts.
             */

        } catch (error) {
            console.error(
                "Erreur d'envoi de la réaction :",
                error
            );

            alert(
                error.message ||
                "Impossible d'envoyer cette réaction."
            );

        } finally {
            sendingReactions.delete(reactionKey);
            button.disabled = false;
        }
    }

    /* ---------- ÉVÉNEMENTS DU FIL ---------- */

    function initializeEvents() {
        document.addEventListener("click", event => {
            const reactionButton = event.target.closest(
                "[data-reaction]"
            );

            if (reactionButton) {
                sendReaction(reactionButton);
                return;
            }

            const commentButton = event.target.closest(
                "[data-comment-toggle]"
            );

            if (commentButton) {
                const postId = getPostId(commentButton);

                if (!postId) return;

                const postElement = getPostElement(postId);

                const section = postElement?.querySelector(
                    "[data-comments-section]"
                );

                if (!section) return;

                section.hidden = !section.hidden;

                if (!section.hidden) {
                    loadComments(postId);
                }
            }
        });

        document.addEventListener("submit", event => {
            const form = event.target.closest(
                "[data-comment-form]"
            );

            if (!form) return;

            event.preventDefault();

            submitComment(form);
        });
    }

    /* ---------- DÉMARRAGE ---------- */

    initializeEvents();

    return {
        loadComments
    };
                                                        }
      
