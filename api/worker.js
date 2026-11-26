const SITE_ORIGIN = "https://drepa-world.kchristezechieljunior.workers.dev";
const SESSION_DAYS = 30;
const ITERATIONS = 100000;
const encoder = new TextEncoder();

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extra
    }
  });
}

function randomHex(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function passwordHash(password, saltHex) {
  const salt = Uint8Array.from(saltHex.match(/.{2}/g), part => parseInt(part, 16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    salt,
    iterations: ITERATIONS,
    hash: "SHA-256"
  }, key, 256);
  return bytesToBase64(new Uint8Array(bits));
}

async function createPasswordRecord(password) {
  const salt = randomHex(16);
  const hash = await passwordHash(password, salt);
  return `pbkdf2$${ITERATIONS}$${salt}$${hash}`;
}

async function verifyPassword(password, record) {
  try {
    const [algorithm, iterations, salt, expected] = record.split("$");
    if (algorithm !== "pbkdf2" || Number(iterations) !== ITERATIONS) return false;
    const actual = await passwordHash(password, salt);
    return actual === expected;
  } catch {
    return false;
  }
}

function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const item = cookie.split(";").map(v => v.trim()).find(v => v.startsWith(name + "="));
  return item ? item.slice(name.length + 1) : "";
}

function sessionCookie(token) {
  return `dw_session=${token}; Max-Age=${SESSION_DAYS * 86400}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function clearSessionCookie() {
  return "dw_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax";
}

function corsHeaders(origin) {
  if (origin !== SITE_ORIGIN) return null;
  return {
    "Access-Control-Allow-Origin": SITE_ORIGIN,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin"
  };
}

function sameLengthEqual(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

async function getAuthenticatedMember(request, env) {
  const token = getCookie(request, "dw_session");
  if (!token) return null;
  const tokenHash = await sha256(token);
  return await env.DB.prepare(
    `SELECT m.id, p.username
     FROM sessions s
     JOIN members m ON m.id = s.member_id
     LEFT JOIN member_profiles p ON p.member_id = m.id
     WHERE s.token_hash = ?
       AND s.expires_at > CURRENT_TIMESTAMP
       AND m.status = 'active'`
  ).bind(tokenHash).first();
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const cors = origin ? corsHeaders(origin) : {};

    if (origin && !cors) {
      return json({ success: false, error: "Origine non autorisée." }, 403);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: { ...cors, "Access-Control-Max-Age": "86400" }
      });
    }

    const respond = (data, status = 200, extra = {}) =>
      json(data, status, { ...cors, ...extra });

    try {
      if (!env.DB) {
        return respond({ success: false, error: "Base de données indisponible." }, 500);
      }

      const url = new URL(request.url);
      const path = url.pathname;

      // SANTÉ DE L'API
      if (request.method === "GET" && path === "/health") {
        const result = await env.DB.prepare("SELECT 1 AS ok").first();
        return respond({ success: true, database: result });
    }
            // INSCRIPTION
      if (request.method === "POST" && path === "/register") {
        const body = await readBody(request);
        if (!body) return respond({ success: false, error: "Données invalides." }, 400);

        const invitationCode = String(
          body.invitationCode ?? body.invitation ?? body.invitation_code ?? body.code ?? ""
        ).trim().toUpperCase();
        const name = String(body.name || "").trim();
        const username = String(body.username || "").trim();
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");

        if (!invitationCode) return respond({ success: false, error: "Le code d'invitation est manquant." }, 400);
        if (!name || !username || !email || !password) {
          return respond({ success: false, error: "Tous les champs sont obligatoires." }, 400);
        }
        if (name.length > 100 || username.length < 3 || username.length > 20 || !/^[A-Za-z0-9_]+$/.test(username)) {
          return respond({ success: false, error: "Nom ou pseudonyme invalide." }, 400);
        }
        if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return respond({ success: false, error: "Adresse e-mail invalide." }, 400);
        }
        if (password.length < 10 || password.length > 128) {
          return respond({ success: false, error: "Le mot de passe doit contenir entre 10 et 128 caractères." }, 400);
        }

        const codeHash = await sha256(invitationCode);
        const invitation = await env.DB.prepare(
          `SELECT id FROM invitations WHERE code_hash = ? AND status = 'active'`
        ).bind(codeHash).first();

        if (!invitation) {
          return respond({ success: false, error: "Code d'invitation invalide ou déjà utilisé." }, 400);
        }

        const existingEmail = await env.DB.prepare(
          "SELECT id FROM members WHERE email = ?"
        ).bind(email).first();

        if (existingEmail) return respond({ success: false, error: "Cette adresse e-mail est déjà utilisée." }, 409);

        const existingUsername = await env.DB.prepare(
          `SELECT member_id FROM member_profiles WHERE username = ? COLLATE NOCASE`
        ).bind(username).first();

        if (existingUsername) return respond({ success: false, error: "Ce pseudonyme est déjà utilisé." }, 409);

        const storedPassword = await createPasswordRecord(password);
        const results = await env.DB.batch([
          env.DB.prepare(
            `UPDATE invitations
             SET status = 'claimed', redeemed_at = CURRENT_TIMESTAMP
             WHERE id = ? AND status = 'active'`
          ).bind(invitation.id),
          env.DB.prepare(
            `INSERT INTO members (name, email, password_hash, status)
             SELECT ?, ?, ?, 'active'
             WHERE EXISTS (
               SELECT 1 FROM invitations
               WHERE id = ? AND status = 'claimed' AND claimed_by IS NULL
             )`
          ).bind(name, email, storedPassword, invitation.id),
          env.DB.prepare(
            `INSERT INTO member_profiles (member_id, username)
             SELECT id, ? FROM members WHERE email = ?`
          ).bind(username, email),
          env.DB.prepare(
            `UPDATE invitations
             SET claimed_by = (SELECT id FROM members WHERE email = ?)
             WHERE id = ? AND status = 'claimed' AND claimed_by IS NULL`
          ).bind(email, invitation.id)
        ]);

        if (results[0].meta.changes !== 1 || results[1].meta.changes !== 1 ||
            results[2].meta.changes !== 1 || results[3].meta.changes !== 1) {
          return respond({
            success: false,
            error: "Inscription non effectuée. Vérifiez le code et réessayez."
          }, 409);
        }

        return respond({
          success: true,
          message: "Compte créé et activé. Vous pouvez maintenant vous connecter."
        }, 201);
      }

      // CONNEXION
      if (request.method === "POST" && path === "/login") {
        const body = await readBody(request);
        if (!body) return respond({ success: false, error: "Données invalides." }, 400);

        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");
        if (!email || !password) {
          return respond({ success: false, error: "E-mail et mot de passe obligatoires." }, 400);
        }

        const member = await env.DB.prepare(
          `SELECT id, name, email, password_hash, status FROM members WHERE email = ?`
        ).bind(email).first();

        if (!member || member.status !== "active" || !(await verifyPassword(password, member.password_hash))) {
          return respond({ success: false, error: "Identifiants incorrects." }, 401);
        }

        const token = randomHex(32);
        const tokenHash = await sha256(token);
        const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();

        await env.DB.prepare(
          `INSERT INTO sessions (member_id, token_hash, expires_at) VALUES (?, ?, ?)`
        ).bind(member.id, tokenHash, expires).run();

        return respond({ success: true, message: "Connexion réussie." }, 200, {
          "Set-Cookie": sessionCookie(token)
        });
      }

      // MEMBRE CONNECTÉ
      if (request.method === "GET" && path === "/me") {
        const member = await getAuthenticatedMember(request, env);
        if (!member) return respond({ success: false, error: "Non connecté ou session expirée." }, 401);

        const fullMember = await env.DB.prepare(
          `SELECT m.id, m.name, m.email, p.username
           FROM members m
           LEFT JOIN member_profiles p ON p.member_id = m.id
           WHERE m.id = ?`
        ).bind(member.id).first();

        return respond({ success: true, member: fullMember });
        }
            // CRÉER UNE PUBLICATION
      if (request.method === "POST" && path === "/posts") {
        const member = await getAuthenticatedMember(request, env);
        if (!member) return respond({ success: false, error: "Vous devez être connecté pour publier." }, 401);

        const body = await readBody(request);
        if (!body) return respond({ success: false, error: "Données invalides." }, 400);

        const content = String(body.content || "").trim();
        if (!content) return respond({ success: false, error: "Votre publication ne peut pas être vide." }, 400);
        if (content.length > 2000) {
          return respond({ success: false, error: "Votre publication ne doit pas dépasser 2 000 caractères." }, 400);
        }

        const result = await env.DB.prepare(
          `INSERT INTO posts (member_id, content, status) VALUES (?, ?, 'published')`
        ).bind(member.id, content).run();

        return respond({
          success: true,
          message: "Votre publication a été créée.",
          postId: result.meta.last_row_id
        }, 201);
      }

      // AFFICHER LE FIL D'ACTUALITÉ
      if (request.method === "GET" && path === "/posts") {
        const member = await getAuthenticatedMember(request, env);
        if (!member) return respond({ success: false, error: "Vous devez être connecté." }, 401);

        const posts = await env.DB.prepare(
          `SELECT
             p.id, p.content, p.created_at, p.member_id,
             COALESCE(mp.username, 'Membre') AS username,
             (SELECT COUNT(*) FROM reactions r WHERE r.post_id = p.id) AS reactions_count,
             (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comments_count,
             (SELECT r.reaction FROM reactions r WHERE r.post_id = p.id AND r.member_id = ?) AS my_reaction
           FROM posts p
           LEFT JOIN member_profiles mp ON mp.member_id = p.member_id
           WHERE p.status = 'published'
           ORDER BY p.created_at DESC, p.id DESC
           LIMIT 50`
        ).bind(member.id).all();

        return respond({ success: true, posts: posts.results || [] });
      }

      // COMMENTER UNE PUBLICATION
      const commentMatch = path.match(/^\/posts\/(\d+)\/comments$/);
      if (request.method === "POST" && commentMatch) {
        const member = await getAuthenticatedMember(request, env);
        if (!member) return respond({ success: false, error: "Vous devez être connecté pour commenter." }, 401);

        const postId = Number(commentMatch[1]);
        const body = await readBody(request);
        if (!body) return respond({ success: false, error: "Données invalides." }, 400);

        const content = String(body.content || "").trim();
        const parentId = body.parentId == null ? null : Number(body.parentId);
        if (!content || content.length > 1000) {
          return respond({ success: false, error: "Le commentaire doit contenir entre 1 et 1 000 caractères." }, 400);
        }

        const post = await env.DB.prepare(
          `SELECT id FROM posts WHERE id = ? AND status = 'published'`
        ).bind(postId).first();

        if (!post) return respond({ success: false, error: "Publication introuvable." }, 404);

        if (parentId !== null) {
          if (!Number.isInteger(parentId) || parentId < 1) {
            return respond({ success: false, error: "Réponse invalide." }, 400);
          }
          const parent = await env.DB.prepare(
            `SELECT id FROM comments WHERE id = ? AND post_id = ?`
          ).bind(parentId, postId).first();
          if (!parent) return respond({ success: false, error: "Commentaire parent introuvable." }, 404);
        }

        const result = await env.DB.prepare(
          `INSERT INTO comments (post_id, member_id, parent_id, content) VALUES (?, ?, ?, ?)`
        ).bind(postId, member.id, parentId, content).run();

        return respond({ success: true, message: "Commentaire ajouté.", commentId: result.meta.last_row_id }, 201);
      }

      // AFFICHER LES COMMENTAIRES
      const commentsMatch = path.match(/^\/posts\/(\d+)\/comments$/);
      if (request.method === "GET" && commentsMatch) {
        const member = await getAuthenticatedMember(request, env);
        if (!member) return respond({ success: false, error: "Vous devez être connecté." }, 401);

        const postId = Number(commentsMatch[1]);
        const post = await env.DB.prepare(
          `SELECT id FROM posts WHERE id = ? AND status = 'published'`
        ).bind(postId).first();
        if (!post) return respond({ success: false, error: "Publication introuvable." }, 404);

        const comments = await env.DB.prepare(
          `SELECT c.id, c.post_id, c.parent_id, c.content, c.created_at,
                  COALESCE(mp.username, 'Membre') AS username
           FROM comments c
           LEFT JOIN member_profiles mp ON mp.member_id = c.member_id
           WHERE c.post_id = ?
           ORDER BY c.created_at ASC, c.id ASC
           LIMIT 100`
        ).bind(postId).all();

        return respond({ success: true, comments: comments.results || [] });
      }

      // RÉAGIR À UNE PUBLICATION
      const reactionMatch = path.match(/^\/posts\/(\d+)\/reactions$/);
      if (request.method === "POST" && reactionMatch) {
        const member = await getAuthenticatedMember(request, env);
        if (!member) return respond({ success: false, error: "Vous devez être connecté pour réagir." }, 401);

        const postId = Number(reactionMatch[1]);
        const body = await readBody(request);
        if (!body) return respond({ success: false, error: "Données invalides." }, 400);

        const reaction = String(body.reaction || "like");
        const allowedReactions = ["like", "support", "courage"];
        if (!allowedReactions.includes(reaction)) {
          return respond({ success: false, error: "Réaction non autorisée." }, 400);
        }

        const post = await env.DB.prepare(
          `SELECT id FROM posts WHERE id = ? AND status = 'published'`
        ).bind(postId).first();
        if (!post) return respond({ success: false, error: "Publication introuvable." }, 404);

        const existing = await env.DB.prepare(
          `SELECT id, reaction FROM reactions WHERE post_id = ? AND member_id = ?`
        ).bind(postId, member.id).first();

        if (existing && existing.reaction === reaction) {
          await env.DB.prepare(
            `DELETE FROM reactions WHERE post_id = ? AND member_id = ?`
          ).bind(postId, member.id).run();
          return respond({ success: true, active: false, message: "Réaction retirée." });
        }

        if (existing) {
          await env.DB.prepare(
            `UPDATE reactions SET reaction = ?, created_at = CURRENT_TIMESTAMP
             WHERE post_id = ? AND member_id = ?`
          ).bind(reaction, postId, member.id).run();
        } else {
          await env.DB.prepare(
            `INSERT INTO reactions (post_id, member_id, reaction) VALUES (?, ?, ?)`
          ).bind(postId, member.id, reaction).run();
        }

        return respond({ success: true, active: true, reaction, message: "Réaction enregistrée." });
      }
            // DÉCONNEXION
      if (request.method === "POST" && path === "/logout") {
        const token = getCookie(request, "dw_session");
        if (token) {
          const tokenHash = await sha256(token);
          await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
        }

        return respond({ success: true, message: "Déconnexion effectuée." }, 200, {
          "Set-Cookie": clearSessionCookie()
        });
      }

      // GÉNÉRATION ADMINISTRATIVE DES INVITATIONS
      if (request.method === "POST" && path === "/admin/invitations") {
        if (!env.ADMIN_SECRET) {
          return respond({ success: false, error: "Configuration administrative manquante." }, 500);
        }

        const authorization = request.headers.get("Authorization") || "";
        const suppliedSecret = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";

        if (!sameLengthEqual(suppliedSecret, env.ADMIN_SECRET)) {
          return respond({ success: false, error: "Accès refusé." }, 401);
        }

        const body = await readBody(request);
        if (!body) return respond({ success: false, error: "Données invalides." }, 400);

        const count = Number(body.count);
        const type = body.type;
        if (!Number.isInteger(count) || count < 1 || count > 200) {
          return respond({ success: false, error: "Le nombre doit être compris entre 1 et 200." }, 400);
        }
        if (!["pioneer", "ordinary", "donneur_ange"].includes(type)) {
          return respond({ success: false, error: "Type d'invitation invalide." }, 400);
        }

        const invitations = [];
        const statements = [];
        for (let i = 0; i < count; i++) {
          const code = "DREPA-" + randomHex(18).toUpperCase();
          const codeHash = await sha256(code);
          invitations.push(code);
          statements.push(
            env.DB.prepare(
              `INSERT INTO invitations (code_hash, invitation_type, status) VALUES (?, ?, 'active')`
            ).bind(codeHash, type)
          );
        }

        await env.DB.batch(statements);
        return respond({
          success: true,
          type,
          count: invitations.length,
          warning: "Conservez ces codes : ils ne seront plus affichés.",
          invitations
        }, 201);
      }

      return respond({ success: false, error: "Route introuvable." }, 404);
    } catch (error) {
      console.error("DREPA-WORLD API ERROR:", error);
      return respond({ success: false, error: "Erreur interne du serveur." }, 500);
    }
  }
};
      
      
      
