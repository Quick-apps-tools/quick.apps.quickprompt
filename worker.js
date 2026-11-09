const ALLOWED_ORIGINS = new Set([
  "https://quick-apps-tools.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000"
]);

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  const headers = {
    "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Range, If-Range",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function jsonResponse(request, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function safeEqual(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

async function githubRequest(env, path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "QuickPrompter-Events-Publisher",
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || `GitHub API returned ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function validateEvents(events) {
  if (!Array.isArray(events) || events.length > 100) throw new Error("Invalid event list.");
  return events.map((event) => {
    if (!event || typeof event.id !== "string" || typeof event.title !== "string" || typeof event.poster !== "string") {
      throw new Error("Each event needs an ID, name, and poster path.");
    }
    if (!/^events\/posters\/[a-z0-9_-]+\.(avif|webp|png|jpe?g)$/i.test(event.poster)) {
      throw new Error("An event poster path is invalid.");
    }
    const songs = Array.isArray(event.songs) ? event.songs : [];
    return {
      id: event.id.slice(0, 80),
      title: event.title.trim().slice(0, 180),
      poster: event.poster,
      songs: songs.map((song) => {
        if (!song || typeof song.title !== "string" || typeof song.path !== "string") throw new Error("A line-up song is invalid.");
        return { title: song.title.trim().slice(0, 180), path: song.path.slice(0, 1000) };
      }).filter((song) => song.title && song.path)
    };
  });
}

async function publishEvents(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return jsonResponse(request, { error: "This website is not allowed to publish events." }, 403);

  const auth = request.headers.get("Authorization") || "";
  const suppliedKey = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!safeEqual(suppliedKey, env.EVENTS_PUBLISH_KEY)) return jsonResponse(request, { error: "Publisher key is incorrect." }, 401);
  if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO || !env.GITHUB_BRANCH) {
    return jsonResponse(request, { error: "GitHub publisher settings are incomplete in the Worker." }, 503);
  }

  try {
    const body = await request.json();
    const events = validateEvents(body.events);
    const images = Array.isArray(body.images) ? body.images : [];
    if (images.length > 100) throw new Error("Too many poster images in one publish.");

    const owner = encodeURIComponent(env.GITHUB_OWNER);
    const repo = encodeURIComponent(env.GITHUB_REPO);
    const branch = encodeURIComponent(env.GITHUB_BRANCH);
    const ref = await githubRequest(env, `/repos/${owner}/${repo}/git/ref/heads/${branch}`);
    const parentSha = ref.object.sha;
    const parent = await githubRequest(env, `/repos/${owner}/${repo}/git/commits/${parentSha}`);
    const treeItems = [];

    for (const image of images) {
      if (!image || typeof image.path !== "string" || !/^events\/posters\/[a-z0-9_-]+\.(avif|webp|png|jpe?g)$/i.test(image.path)) {
        throw new Error("A poster filename is invalid.");
      }
      if (typeof image.contentBase64 !== "string" || image.contentBase64.length > 18_000_000) {
        throw new Error("A poster is too large. Please use an image under about 13 MB.");
      }
      const blob = await githubRequest(env, `/repos/${owner}/${repo}/git/blobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: image.contentBase64, encoding: "base64" })
      });
      treeItems.push({ path: image.path, mode: "100644", type: "blob", sha: blob.sha });
    }

    const eventsBlob = await githubRequest(env, `/repos/${owner}/${repo}/git/blobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: JSON.stringify(events, null, 2) + "\n", encoding: "utf-8" })
    });
    treeItems.push({ path: "events.json", mode: "100644", type: "blob", sha: eventsBlob.sha });

    const tree = await githubRequest(env, `/repos/${owner}/${repo}/git/trees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base_tree: parent.tree.sha, tree: treeItems })
    });
    const commit = await githubRequest(env, `/repos/${owner}/${repo}/git/commits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Update event posters and line-ups", tree: tree.sha, parents: [parentSha] })
    });
    await githubRequest(env, `/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sha: commit.sha, force: false })
    });
    return jsonResponse(request, { ok: true, commit: commit.sha });
  } catch (error) {
    const status = error.status === 409 || error.status === 422 ? 409 : 400;
    return jsonResponse(request, { error: error.message || "Could not publish the event update." }, status);
  }
}

async function proxyRequest(request) {
  const url = new URL(request.url);
  const target = url.searchParams.get("url");
  if (!target) return new Response("Missing target URL", { status: 400, headers: corsHeaders(request) });

  let targetUrl;
  try { targetUrl = new URL(target); } catch { return new Response("Invalid target URL", { status: 400, headers: corsHeaders(request) }); }
  if (targetUrl.protocol !== "https:") return new Response("Only HTTPS targets are allowed", { status: 400, headers: corsHeaders(request) });

  const headers = new Headers();
  for (const name of ["Range", "If-Range", "Accept"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const upstream = await fetch(new Request(targetUrl, { method: request.method, headers }));
  const responseHeaders = new Headers(upstream.headers);
  for (const [name, value] of Object.entries(corsHeaders(request))) responseHeaders.set(name, value);
  responseHeaders.set("Access-Control-Expose-Headers", "Accept-Ranges, Content-Range, Content-Length, ETag");
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (url.pathname === "/publish-events" && request.method === "POST") return publishEvents(request, env);
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405, headers: cors });
    try { return await proxyRequest(request); }
    catch (error) { return new Response("Proxy error: " + error.message, { status: 502, headers: cors }); }
  }
};
