const SITE_ORIGIN = "https://drepa-world.kchristezechieljunior.workers.dev";
const SESSION_DAYS = 30;
const ITERATIONS = 100000;
const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;
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
  const salt = Uint8Array.from(
    saltHex.match(/.{2}/g),
    part => parseInt(part, 16)
  );

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

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

    if (algorithm !== "pbkdf2" || Number(iterations) !== ITERATIONS) {
      return false;
    }

    const actual = await passwordHash(password, salt);
    return actual === expected;
  } catch {
    return false;
  }
}

function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";

  const item = cookie
    .split(";")
    .map(v => v.trim())
    .find(v => v.startsWith(name + "="));

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

  for (let i = 0; i < a.length; i++) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

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

function mediaFileInfo(file) {
  const types = {
    "image/jpeg": { type: "image", extension: "jpg" },
    "image/png": { type: "image", extension: "png" },
    "image/webp": { type: "image", extension: "webp" },
    "image/gif": { type: "image", extension: "gif" },
    "video/mp4": { type: "video", extension: "mp4" },
    "video/webm": { type: "video", extension: "webm" },
    "video/quicktime": { type: "video", extension: "mov" }
  };

  return types[file.type] || null;
}

function mediaResponseUrl(key) {
  return "/media/" + encodeURIComponent(key);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const cors = origin ? corsHeaders(origin) : {};

    if (origin && !cors) {
      return json({
        success: false,
        error: "Origine non autorisée."
      }, 403);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          "Access-Control-Max-Age": "86400"
        }
      });
    }

    const respond = (data, status = 200, extra = {}) =>
      json(data, status, { ...cors, ...extra });

    try {
      if (!env.DB) {
        return respond({
          success: false,
          error: "Base de données indisponible."
        }, 500);
      }

      const url = new URL(request.url);
      const path = url.pathname;

      // SANTÉ DE L'API
      if (request.method === "GET" && path === "/health") {
        const result = await env.DB.prepare(
          "SELECT 1 AS ok"
        ).first();

        return respond({
          success: true,
          database: result,
          mediaStorage: Boolean(env.MEDIA)
        });
      }

      // INSCRIPTION
      if (request.method === "POST" && path === "/register") {
        const body = await readBody(request);

        if (!body) {
          return respond({
            success: false,
            error: "Données invalides."
          }, 400);
        }

        const invitationCode = String(
          body.invitationCode ??
          body.invitation ??
          body.invitation_code ??
          body.code ??
          ""
        ).trim().toUpperCase();

        const name = String(body.name || "").trim();
        const username = String(body.username || "").trim();
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");

        if (!invitationCode) {
          return respond({
            success: false,
            error: "Le code d'invitation est manquant."
          }, 400);
        }

        if (!name || !username || !email || !password) {
          return respond({
            success: false,
            error: "Tous les champs sont obligatoires."
          }, 400);
        }

        if (
          name.length > 100 ||
          username.length < 3 ||
          username.length > 20 ||
          !/^[A-Za-z0-9_]+$/.test(username)
        ) {
          return respond({
            success: false,
            error: "Nom ou pseudonyme invalide."
          }, 400);
        }

        if (
          email.length > 254 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ) {
          return respond({
            success: false,
            error: "Adresse e-mail invalide."
          }, 400);
        }

        if (password.length < 10 || password.length > 128) {
          return respond({
            success: false,
            error: "Le mot de passe doit contenir entre 10 et 128 caractères."
          }, 400);
        }

        const codeHash = await sha256(invitationCode);

        const invitation = await env.DB.prepare(
          `SELECT id FROM invitations
           WHERE code_hash = ? AND status = 'active'`
        ).bind(codeHash).first();

        if (!invitation) {
          return respond({
            success: false,
            error: "Code d'invitation invalide ou déjà utilisé."
          }, 400);
        }

        const existingEmail = await env.DB.prepare(
          "SELECT id FROM members WHERE email = ?"
        ).bind(email).first();

        if (existingEmail) {
          return respond({
            success: false,
            error: "Cette adresse e-mail est déjà utilisée."
          }, 409);
        }

        const existingUsername = await env.DB.prepare(
          `SELECT member_id FROM member_profiles
           WHERE username = ? COLLATE NOCASE`
        ).bind(username).first();

        if (existingUsername) {
          return respond({
            success: false,
            error: "Ce pseudonyme est déjà utilisé."
          }, 409);
        }

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
               WHERE id = ?
                 AND status = 'claimed'
                 AND claimed_by IS NULL
             )`
          ).bind(name, email, storedPassword, invitation.id),

          env.DB.prepare(
            `INSERT INTO member_profiles (member_id, username)
             SELECT id, ? FROM members WHERE email = ?`
          ).bind(username, email),

          env.DB.prepare(
            `UPDATE invitations
             SET claimed_by = (SELECT id FROM members WHERE email = ?)
             WHERE id = ?
               AND status = 'claimed'
               AND claimed_by IS NULL`
          ).bind(email, invitation.id)
        ]);

        if (
          results[0].meta.changes !== 1 ||
          results[1].meta.changes !== 1 ||
          results[2].meta.changes !== 1 ||
          results[3].meta.changes !== 1
        ) {
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

        if (!body) {
          return respond({
            success: false,
            error: "Données invalides."
          }, 400);
        }

        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");

        if (!email || !password) {
          return respond({
            success: false,
            error: "E-mail et mot de passe obligatoires."
          }, 400);
        }

        const member = await env.DB.prepare(
          `SELECT id, name, email, password_hash, status
           FROM members WHERE email = ?`
        ).bind(email).first();

        if (
          !member ||
          member.status !== "active" ||
          !(await verifyPassword(password, member.password_hash))
        ) {
          return respond({
            success: false,
            error: "Identifiants incorrects."
          }, 401);
        }

        const token = randomHex(32);
        const tokenHash = await sha256(token);
        const expires = new Date(
          Date.now() + SESSION_DAYS * 86400000
        ).toISOString();

        await env.DB.prepare(
          `INSERT INTO sessions (member_id, token_hash, expires_at)
           VALUES (?, ?, ?)`
        ).bind(member.id, tokenHash, expires).run();

        return respond({
          success: true,
          message: "Connexion réussie."
        }, 200, {
          "Set-Cookie": sessionCookie(token)
        });
      }

      // MEMBRE CONNECTÉ
      if (request.method === "GET" && path === "/me") {
        const member = await getAuthenticatedMember(request, env);

        if (!member) {
          return respond({
            success: false,
            error: "Non connecté ou session expirée."
          }, 401);
        }

        const fullMember = await env.DB.prepare(
          `SELECT m.id, m.name, m.email, p.username
           FROM members m
           LEFT JOIN member_profiles p ON p.member_id = m.id
           WHERE m.id = ?`
        ).bind(member.id).first();

        return respond({
          success: true,
          member: fullMember
        });
      }
      // PROFIL PERSONNEL DU MEMBRE
if (
  (request.method === "GET" || request.method === "POST") &&
  path === "/profile"
) {
  const member = await getAuthenticatedMember(request, env);

  if (!member) {
    return respond({
      success: false,
      error: "Connectez-vous pour accéder à votre profil."
    }, 401);
  }

  if (request.method === "POST") {
    const body = await readBody(request);

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return respond({
        success: false,
        error: "Données du profil invalides."
      }, 400);
    }

    const fields = {
      city: 100,
      origin_city: 100,
      birth_date: 10,
      relationship_status: 50,
      family_info: 1000,
      gender: 50,
      languages: 500
    };

    const values = {};

    for (const [field, maxLength] of Object.entries(fields)) {
      const value = String(body[field] ?? "").trim();

      if (value.length > maxLength) {
        return respond({
          success: false,
          error: `Le champ ${field} est trop long.`
        }, 400);
      }

      values[field] = value || null;
    }

    if (
      values.birth_date &&
      !/^\d{4}-\d{2}-\d{2}$/.test(values.birth_date)
    ) {
      return respond({
        success: false,
        error: "Format de date invalide."
      }, 400);
    }

    await env.DB.prepare(
      `UPDATE member_profiles
       SET city = ?,
           origin_city = ?,
           birth_date = ?,
           relationship_status = ?,
           family_info = ?,
           gender = ?,
           languages = ?
       WHERE member_id = ?`
    ).bind(
      values.city,
      values.origin_city,
      values.birth_date,
      values.relationship_status,
      values.family_info,
      values.gender,
      values.languages,
      member.id
    ).run();
  }

  const profile = await env.DB.prepare(
    `SELECT username, photo_url, country, city, bio,
            origin_city, birth_date, relationship_status,
            family_info, gender, languages
     FROM member_profiles
     WHERE member_id = ?`
  ).bind(member.id).first();

  return respond({
    success: true,
    profile
  });
}
      
      // EXPÉRIENCES PROFESSIONNELLES
      if (
        (request.method === "GET" || request.method === "POST") &&
        path === "/work-experiences"
      ) {
        const member = await getAuthenticatedMember(request, env);

        if (!member) {
          return respond({
            success: false,
            error: "Connectez-vous pour accéder à vos expériences."
          }, 401);
        }

        if (request.method === "POST") {
          const body = await readBody(request);

          if (!body || typeof body !== "object" || Array.isArray(body)) {
            return respond({
              success: false,
              error: "Données invalides."
            }, 400);
          }

          const fields = {
            company: 150,
            position: 150,
            employment_type: 80,
            location: 150,
            start_date: 10,
            end_date: 10,
            description: 2000
          };

          const values = {};

          for (const [field, maxLength] of Object.entries(fields)) {
            const value = String(body[field] ?? "").trim();

            if (value.length > maxLength) {
              return respond({
                success: false,
                error: `Le champ ${field} est trop long.`
              }, 400);
            }

            values[field] = value || null;
          }

          const isCurrent = body.is_current === true ||
            body.is_current === 1 ||
            body.is_current === "1";

          await env.DB.prepare(
            `INSERT INTO work_experiences
             (member_id, company, position, employment_type,
              location, start_date, end_date, is_current, description)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            member.id,
            values.company,
            values.position,
            values.employment_type,
            values.location,
            values.start_date,
            isCurrent ? null : values.end_date,
            isCurrent ? 1 : 0,
            values.description
          ).run();
        }

        const experiences = await env.DB.prepare(
          `SELECT id, company, position, employment_type,
                  location, start_date, end_date, is_current,
                  description, created_at
           FROM work_experiences
           WHERE member_id = ?
           ORDER BY is_current DESC, start_date DESC, id DESC`
        ).bind(member.id).all();

        return respond({
          success: true,
          experiences: experiences.results || []
        });
      }
      

      // CRÉER UNE PUBLICATION
      if (request.method === "POST" && path === "/posts") {
        const member = await getAuthenticatedMember(request, env);

        if (!member) {
          return respond({
            success: false,
            error: "Connectez-vous pour publier."
          }, 401);
        }

        let content = "";
        let file = null;

        const contentType = request.headers.get("Content-Type") || "";

        if (contentType.includes("multipart/form-data")) {
          const formData = await request.formData();

          content = String(formData.get("content") || "").trim();

          const uploadedFile = formData.get("media");

          if (
            uploadedFile &&
            typeof uploadedFile === "object" &&
            typeof uploadedFile.size === "number" &&
            uploadedFile.size > 0
          ) {
            file = uploadedFile;
          }
        } else {
          const body = await readBody(request);

          if (!body) {
            return respond({
              success: false,
              error: "Données de publication invalides."
            }, 400);
          }

          content = String(body.content || "").trim();
        }

        if (content.length > 5000) {
          return respond({
            success: false,
            error: "La publication ne peut pas dépasser 5000 caractères."
          }, 400);
        }

        if (!content && !file) {
          return respond({
            success: false,
            error: "Écrivez un message ou ajoutez une photo ou une vidéo."
          }, 400);
        }

        let mediaKey = null;
        let mediaType = null;

        if (file) {
          if (!env.MEDIA) {
            return respond({
              success: false,
              error: "Le stockage des médias n'est pas disponible."
            }, 500);
          }

          const fileInfo = mediaFileInfo(file);

          if (!fileInfo) {
            return respond({
              success: false,
              error: "Format de fichier non autorisé."
            }, 400);
          }

          const maximumSize = fileInfo.type === "image"
            ? MAX_IMAGE_SIZE
            : MAX_VIDEO_SIZE;

          if (file.size > maximumSize) {
            return respond({
              success: false,
              error: fileInfo.type === "image"
                ? "La photo dépasse la limite de 8 Mo."
                : "La vidéo dépasse la limite de 50 Mo."
            }, 400);
          }

          mediaKey =
            `posts/${member.id}/${randomHex(16)}.${fileInfo.extension}`;

          mediaType = fileInfo.type;

          try {
            await env.MEDIA.put(mediaKey, file.stream(), {
              httpMetadata: {
                contentType: file.type
              }
            });
          } catch (error) {
            return respond({
              success: false,
              error: "Impossible d'enregistrer le média. Réessayez."
            }, 500);
          }
        }

        try {
          const result = await env.DB.prepare(
            `INSERT INTO posts
             (member_id, content, media_url, media_type, status)
             VALUES (?, ?, ?, ?, 'published')`
          ).bind(
            member.id,
            content,
            mediaKey,
            mediaType
          ).run();

          return respond({
            success: true,
            message: "Publication créée.",
            post: {
              id: result.meta.last_row_id,
              content,
              media_url: mediaKey
                ? mediaResponseUrl(mediaKey)
                : null,
              media_type: mediaType
            }
          }, 201);

        } catch (error) {
          if (mediaKey && env.MEDIA) {
            await env.MEDIA.delete(mediaKey).catch(() => {});
          }

          return respond({
            success: false,
            error: "La publication n'a pas pu être enregistrée."
          }, 500);
        }
            }
            // RÉCUPÉRER LES PUBLICATIONS AVEC PAGINATION
      if (request.method === "GET" && path === "/posts") {
        const member = await getAuthenticatedMember(request, env);

        if (!member) {
          return respond({
            success: false,
            error: "Connectez-vous pour voir les publications."
          }, 401);
        }

        const requestedLimit = Number(url.searchParams.get("limit") || 10);
        const limit = Number.isInteger(requestedLimit)
          ? Math.min(Math.max(requestedLimit, 1), 20)
          : 10;

        const cursorValue = url.searchParams.get("cursor");
        const cursor = cursorValue ? Number(cursorValue) : null;

        if (
          cursor !== null &&
          (!Number.isSafeInteger(cursor) || cursor < 1)
        ) {
          return respond({
            success: false,
            error: "Curseur de pagination invalide."
          }, 400);
        }

        let query;
        let results;

        if (cursor !== null) {
          query = env.DB.prepare(
            `SELECT
               p.id,
               p.member_id,
               p.content,
               p.media_url,
               p.media_type,
               p.created_at,
               COALESCE(mp.username, m.name) AS author,
               (
                 SELECT COUNT(*)
                 FROM reactions r
                 WHERE r.post_id = p.id
               ) AS reactions_count,
               (
                 SELECT COUNT(*)
                 FROM comments c
                 WHERE c.post_id = p.id
               ) AS comments_count
             FROM posts p
             JOIN members m ON m.id = p.member_id
             LEFT JOIN member_profiles mp ON mp.member_id = m.id
             WHERE p.status = 'published'
               AND p.id < ?
             ORDER BY p.created_at DESC, p.id DESC
             LIMIT ?`
          ).bind(cursor, limit + 1);
        } else {
          query = env.DB.prepare(
            `SELECT
               p.id,
               p.member_id,
               p.content,
               p.media_url,
               p.media_type,
               p.created_at,
               COALESCE(mp.username, m.name) AS author,
               (
                 SELECT COUNT(*)
                 FROM reactions r
                 WHERE r.post_id = p.id
               ) AS reactions_count,
               (
                 SELECT COUNT(*)
                 FROM comments c
                 WHERE c.post_id = p.id
               ) AS comments_count
             FROM posts p
             JOIN members m ON m.id = p.member_id
             LEFT JOIN member_profiles mp ON mp.member_id = m.id
             WHERE p.status = 'published'
             ORDER BY p.created_at DESC, p.id DESC
             LIMIT ?`
          ).bind(limit + 1);
        }

        const result = await query.all();

        results = result.results || [];

        const hasMore = results.length > limit;

        if (hasMore) {
          results = results.slice(0, limit);
        }

        const posts = results.map(post => ({
          ...post,
          media_url: post.media_url
            ? mediaResponseUrl(post.media_url)
            : null
        }));

        const nextCursor = posts.length > 0
          ? posts[posts.length - 1].id
          : null;

        return respond({
          success: true,
          posts,
          hasMore,
          nextCursor
        });
      }

      // AJOUTER UN COMMENTAIRE
      if (
        request.method === "POST" &&
        /^\/posts\/\d+\/comments$/.test(path)
      ) {
        const member = await getAuthenticatedMember(request, env);

        if (!member) {
          return respond({
            success: false,
            error: "Connectez-vous pour commenter."
          }, 401);
        }

        const postId = Number(path.split("/")[2]);
        const body = await readBody(request);

        const content = String(body?.content || "").trim();

        if (!content || content.length > 2000) {
          return respond({
            success: false,
            error: "Le commentaire doit contenir entre 1 et 2000 caractères."
          }, 400);
        }

        const post = await env.DB.prepare(
          `SELECT id FROM posts
           WHERE id = ? AND status = 'published'`
        ).bind(postId).first();

        if (!post) {
          return respond({
            success: false,
            error: "Cette publication n'existe pas."
          }, 404);
        }

        const result = await env.DB.prepare(
          `INSERT INTO comments (post_id, member_id, content)
           VALUES (?, ?, ?)`
        ).bind(postId, member.id, content).run();

        return respond({
          success: true,
          message: "Commentaire ajouté.",
          comment: {
            id: result.meta.last_row_id,
            post_id: postId,
            member_id: member.id,
            content
          }
        }, 201);
      }

      // RÉCUPÉRER LES COMMENTAIRES
      if (
        request.method === "GET" &&
        /^\/posts\/\d+\/comments$/.test(path)
      ) {
        const member = await getAuthenticatedMember(request, env);

        if (!member) {
          return respond({
            success: false,
            error: "Connectez-vous pour voir les commentaires."
          }, 401);
        }

        const postId = Number(path.split("/")[2]);

        const post = await env.DB.prepare(
          `SELECT id FROM posts
           WHERE id = ? AND status = 'published'`
        ).bind(postId).first();

        if (!post) {
          return respond({
            success: false,
            error: "Cette publication n'existe pas."
          }, 404);
        }

        const result = await env.DB.prepare(
          `SELECT
             c.id,
             c.post_id,
             c.member_id,
             c.parent_id,
             c.content,
             c.created_at,
             COALESCE(p.username, m.name) AS author
           FROM comments c
           JOIN members m ON m.id = c.member_id
           LEFT JOIN member_profiles p ON p.member_id = m.id
           WHERE c.post_id = ?
           ORDER BY c.created_at ASC, c.id ASC`
        ).bind(postId).all();

        return respond({
          success: true,
          comments: result.results || []
        });
        }
            // AJOUTER OU MODIFIER UNE RÉACTION
      if (
        request.method === "POST" &&
        /^\/posts\/\d+\/reactions$/.test(path)
      ) {
        const member = await getAuthenticatedMember(request, env);

        if (!member) {
          return respond({
            success: false,
            error: "Connectez-vous pour réagir."
          }, 401);
        }

        const postId = Number(path.split("/")[2]);
        const body = await readBody(request);

        const reaction = String(body?.reaction || "like");

        const allowedReactions = [
          "like",
          "support",
          "courage"
        ];

        if (!allowedReactions.includes(reaction)) {
          return respond({
            success: false,
            error: "Réaction non autorisée."
          }, 400);
        }

        const post = await env.DB.prepare(
          `SELECT id FROM posts
           WHERE id = ? AND status = 'published'`
        ).bind(postId).first();

        if (!post) {
          return respond({
            success: false,
            error: "Cette publication n'existe pas."
          }, 404);
        }

        const existing = await env.DB.prepare(
          `SELECT id, reaction
           FROM reactions
           WHERE post_id = ? AND member_id = ?`
        ).bind(postId, member.id).first();

        if (existing && existing.reaction === reaction) {
          await env.DB.prepare(
            `DELETE FROM reactions
             WHERE id = ?`
          ).bind(existing.id).run();

          return respond({
            success: true,
            action: "removed",
            reaction: null
          });
        }

        if (existing) {
          await env.DB.prepare(
            `UPDATE reactions
             SET reaction = ?, created_at = CURRENT_TIMESTAMP
             WHERE id = ?`
          ).bind(reaction, existing.id).run();
        } else {
          await env.DB.prepare(
            `INSERT INTO reactions (post_id, member_id, reaction)
             VALUES (?, ?, ?)`
          ).bind(postId, member.id, reaction).run();
        }

        return respond({
          success: true,
          action: "saved",
          reaction
        });
      }

      // SERVIR UNE PHOTO OU UNE VIDÉO DEPUIS R2
      // L'accès est réservé aux membres connectés.
      if (
        request.method === "GET" &&
        path.startsWith("/media/")
      ) {
        const member = await getAuthenticatedMember(request, env);

        if (!member) {
          return respond({
            success: false,
            error: "Connexion requise pour consulter ce média."
          }, 401);
        }

        if (!env.MEDIA) {
          return respond({
            success: false,
            error: "Stockage des médias indisponible."
          }, 500);
        }

        let mediaKey;

        try {
          mediaKey = decodeURIComponent(
            path.slice("/media/".length)
          );
        } catch {
          return respond({
            success: false,
            error: "Adresse du média invalide."
          }, 400);
        }

        const validKey =
          /^posts\/\d+\/[a-f0-9]{32}\.(jpg|png|webp|gif|mp4|webm|mov)$/;

        if (!validKey.test(mediaKey)) {
          return respond({
            success: false,
            error: "Média introuvable."
          }, 404);
        }

        // Vérifier que le média appartient à une publication publiée.
        const publication = await env.DB.prepare(
          `SELECT id
           FROM posts
           WHERE media_url = ?
             AND status = 'published'`
        ).bind(mediaKey).first();

        if (!publication) {
          return respond({
            success: false,
            error: "Média introuvable."
          }, 404);
        }

        const metadata = await env.MEDIA.head(mediaKey);

        if (!metadata) {
          return respond({
            success: false,
            error: "Fichier média introuvable."
          }, 404);
        }

        const mediaHeaders = {
          "Content-Type":
            metadata.httpMetadata?.contentType ||
            "application/octet-stream",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Disposition": "inline",
          "Accept-Ranges": "bytes",
          ...cors
        };

        const rangeHeader = request.headers.get("Range");

        // Chargement complet si aucune plage n'est demandée.
        if (!rangeHeader) {
          const object = await env.MEDIA.get(mediaKey);

          if (!object) {
            return respond({
              success: false,
              error: "Fichier média introuvable."
            }, 404);
          }

          mediaHeaders["Content-Length"] = String(object.size);

          return new Response(object.body, {
            status: 200,
            headers: mediaHeaders
          });
        }

        // Prise en charge des requêtes vidéo Range.
        const rangeMatch = rangeHeader.match(
          /^bytes=(\d*)-(\d*)$/
        );

        if (!rangeMatch) {
          return new Response(null, {
            status: 416,
            headers: {
              ...mediaHeaders,
              "Content-Range": `bytes */${metadata.size}`
            }
          });
        }

        let start;
        let end;

        if (rangeMatch[1] === "") {
          // Plage de fin : bytes=-500
          const suffixLength = Number(rangeMatch[2]);

          if (
            !Number.isSafeInteger(suffixLength) ||
            suffixLength <= 0
          ) {
            return new Response(null, {
              status: 416,
              headers: {
                ...mediaHeaders,
                "Content-Range": `bytes */${metadata.size}`
              }
            });
          }

          start = Math.max(0, metadata.size - suffixLength);
          end = metadata.size - 1;
        } else {
          start = Number(rangeMatch[1]);
          end = rangeMatch[2] === ""
            ? metadata.size - 1
            : Number(rangeMatch[2]);
        }

        if (
          !Number.isSafeInteger(start) ||
          !Number.isSafeInteger(end) ||
          start < 0 ||
          end < start ||
          start >= metadata.size
        ) {
          return new Response(null, {
            status: 416,
            headers: {
              ...mediaHeaders,
              "Content-Range": `bytes */${metadata.size}`
            }
          });
        }

        end = Math.min(end, metadata.size - 1);

        const length = end - start + 1;

        const partialObject = await env.MEDIA.get(mediaKey, {
          range: {
            offset: start,
            length
          }
        });

        if (!partialObject) {
          return respond({
            success: false,
            error: "Impossible de charger ce média."
          }, 404);
        }

        mediaHeaders["Content-Length"] = String(length);
        mediaHeaders["Content-Range"] =
          `bytes ${start}-${end}/${metadata.size}`;

        return new Response(partialObject.body, {
          status: 206,
          headers: mediaHeaders
        });
                           }
            // DÉCONNEXION
      if (request.method === "POST" && path === "/logout") {
        const token = getCookie(request, "dw_session");

        if (token) {
          const tokenHash = await sha256(token);

          await env.DB.prepare(
            `DELETE FROM sessions
             WHERE token_hash = ?`
          ).bind(tokenHash).run();
        }

        return respond({
          success: true,
          message: "Déconnexion effectuée."
        }, 200, {
          "Set-Cookie": clearSessionCookie()
        });
      }

      // CRÉER DES CODES D'INVITATION
      if (
        request.method === "POST" &&
        path === "/admin/invitations"
      ) {
        if (!env.ADMIN_SECRET) {
          return respond({
            success: false,
            error: "Configuration administrateur indisponible."
          }, 500);
        }

        const authorization =
          request.headers.get("Authorization") || "";

        const expectedAuthorization =
          `Bearer ${env.ADMIN_SECRET}`;

        if (
          !sameLengthEqual(
            authorization,
            expectedAuthorization
          )
        ) {
          return respond({
            success: false,
            error: "Accès administrateur refusé."
          }, 401);
        }

        const body = await readBody(request);

        if (!body) {
          return respond({
            success: false,
            error: "Données invalides."
          }, 400);
        }

        const count = Number(body.count || 1);
        const type = String(body.type || "ordinary");

        const allowedTypes = [
          "pioneer",
          "ordinary",
          "donneur_ange"
        ];

        if (
          !Number.isInteger(count) ||
          count < 1 ||
          count > 200
        ) {
          return respond({
            success: false,
            error: "Le nombre doit être compris entre 1 et 200."
          }, 400);
        }

        if (!allowedTypes.includes(type)) {
          return respond({
            success: false,
            error: "Type d'invitation invalide."
          }, 400);
        }

        const invitations = [];

        for (let i = 0; i < count; i++) {
          const code =
            "DREPA-" + randomHex(6).toUpperCase();

          const codeHash = await sha256(code);

          await env.DB.prepare(
            `INSERT INTO invitations
             (code_hash, invitation_type, status)
             VALUES (?, ?, 'active')`
          ).bind(codeHash, type).run();

          invitations.push(code);
        }

        return respond({
          success: true,
          message: "Invitations créées.",
          count: invitations.length,
          type,
          invitations
        }, 201);
      }

      // ROUTE INCONNUE
      return respond({
        success: false,
        error: "Route introuvable."
      }, 404);

    } catch (error) {
      return respond({
        success: false,
        error: "Une erreur interne est survenue."
      }, 500);
    }
  }
};
