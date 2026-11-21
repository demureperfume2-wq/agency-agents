#!/usr/bin/env node
// Zernio client for The Agency: lets an agent create profiles, hand out
// connect links, list connected accounts and publish/schedule posts.
// API reference: https://zernio.com/llms.txt
//
// Zero dependencies (Node 18+). The API key is read from ZERNIO_API_KEY.
// Never hard-code the key or commit it.

const BASE_URL = process.env.ZERNIO_BASE_URL || "https://zernio.com/api/v1";

function apiKey() {
  const key = process.env.ZERNIO_API_KEY;
  if (!key) {
    throw new Error("ZERNIO_API_KEY is not set. Create a key in the Zernio dashboard and export it.");
  }
  return key;
}

async function request(method, path, { query, body } = {}) {
  const url = new URL(BASE_URL + path);
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  }
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = data.error || data.message || text || res.statusText;
    throw new Error(`Zernio ${method} ${path} failed (${res.status}): ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
  }
  return data;
}

const idOf = (obj) => obj?._id || obj?.id;

// --- API --------------------------------------------------------------------

export async function listProfiles() {
  const data = await request("GET", "/profiles");
  return data.profiles || data.data || (Array.isArray(data) ? data : []);
}

export async function createProfile({ name, description, color, externalId } = {}) {
  const data = await request("POST", "/profiles", { body: { name, description, color, externalId } });
  return data.profile || data;
}

// Reuse an existing profile (by name, else the first one) so accounts stay in
// one place; create one only when the workspace has none.
export async function ensureProfile({ name = "Demure Fragrance", forceNew = false } = {}) {
  if (!forceNew) {
    const profiles = await listProfiles();
    const match = profiles.find((p) => p.name === name) || profiles[0];
    if (match) return { profile: match, created: false };
  }
  return { profile: await createProfile({ name }), created: true };
}

export async function getConnectUrl(platform, { profileId, redirectUrl } = {}) {
  if (!profileId) throw new Error("profileId is required");
  return request("GET", `/connect/${encodeURIComponent(platform)}`, {
    query: { profileId, redirect_url: redirectUrl },
  });
}

export async function listAccounts({ profileId } = {}) {
  const data = await request("GET", "/accounts", { query: { profileId } });
  return data.accounts || [];
}

// platforms: [{ platform: "instagram", accountId: "..." }]
// Pass scheduledFor (ISO) to schedule, publishNow to post at once, or isDraft.
export async function createPost({ content, platforms, profileId, scheduledFor, timezone, publishNow, isDraft, mediaUrls = [] }) {
  if (!content) throw new Error("content is required");
  if (!platforms?.length) throw new Error("at least one platform/account is required");
  const body = { content, platforms, profileId };
  if (scheduledFor) { body.scheduledFor = scheduledFor; body.timezone = timezone || "Africa/Accra"; }
  else if (publishNow) body.publishNow = true;
  else body.isDraft = true; // safe default: never publish by accident
  if (mediaUrls.length) body.mediaItems = mediaUrls.map((url) => ({ url }));
  return request("POST", "/posts", { body });
}

// --- CLI --------------------------------------------------------------------

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { args._.push(a); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    const value = next === undefined || next.startsWith("--") ? true : (i++, next);
    if (key in args) args[key] = [].concat(args[key], value);
    else args[key] = value;
  }
  return args;
}

const USAGE = `Usage: node integrations/zernio/zernio.mjs <command> [options]

  setup [platform]        Find or create a profile, then print a connect link
                          (default platform: instagram). Options: --name, --new
  profiles                List profiles
  connect <platform>      Print a connect link. --profile <id> [--redirect <url>]
  accounts                List connected accounts. [--profile <id>]
  post                    --content "..." --account <platform:accountId> (repeatable)
                          [--profile <id>] [--at <ISO time>] [--now] [--media <https url>]
                          Without --at or --now the post is saved as a draft.

Platforms: instagram, tiktok, facebook, youtube, linkedin, threads, twitter, pinterest.
Requires ZERNIO_API_KEY in the environment.`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [cmd, arg1] = args._;
  const out = (v) => console.log(JSON.stringify(v, null, 2));

  switch (cmd) {
    case "setup": {
      const platform = arg1 || "instagram";
      const { profile, created } = await ensureProfile({
        name: typeof args.name === "string" ? args.name : undefined,
        forceNew: Boolean(args.new),
      });
      const profileId = idOf(profile);
      const { authUrl } = await getConnectUrl(platform, { profileId, redirectUrl: args.redirect });
      out({ profileId, profileName: profile.name, profileCreated: created, platform, authUrl });
      console.error(`\nOpen authUrl in a browser signed in to the ${platform} account and approve access.`);
      break;
    }
    case "profiles":
      out(await listProfiles());
      break;
    case "connect": {
      if (!arg1) throw new Error("connect needs a platform, e.g. connect tiktok");
      const profileId = args.profile || idOf((await ensureProfile()).profile);
      out(await getConnectUrl(arg1, { profileId, redirectUrl: args.redirect }));
      break;
    }
    case "accounts":
      out(await listAccounts({ profileId: args.profile }));
      break;
    case "post": {
      const accounts = [].concat(args.account || []).map((s) => {
        const [platform, accountId] = String(s).split(":");
        if (!platform || !accountId) throw new Error(`--account must look like instagram:<accountId>, got "${s}"`);
        return { platform, accountId };
      });
      out(await createPost({
        content: args.content,
        platforms: accounts,
        profileId: args.profile,
        scheduledFor: args.at,
        publishNow: Boolean(args.now),
        mediaUrls: [].concat(args.media || []),
      }));
      break;
    }
    default:
      console.log(USAGE);
      process.exitCode = cmd && cmd !== "help" ? 1 : 0;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
