# Zernio Integration

> Let marketing agents publish and schedule social posts through [Zernio](https://zernio.com) (Instagram, TikTok, Facebook, YouTube, LinkedIn, Threads, X, Pinterest).

API reference: <https://zernio.com/llms.txt>

## Setup

1. Create an API key in the Zernio dashboard.
2. Export it. Never commit it or paste it into an agent prompt.

   ```bash
   export ZERNIO_API_KEY="sk_..."
   ```

3. Create (or reuse) a profile and get a connect link for the first account:

   ```bash
   node integrations/zernio/zernio.mjs setup instagram
   ```

   This reuses an existing profile, so all accounts stay in one place. It only creates a new one (named `Demure Fragrance`) when the workspace has none. Pass `--new` to force a new profile, or `--name "<name>"` to choose its name.

4. Open the printed `authUrl` in a browser that is signed in to the account, and approve access. Repeat for each platform:

   ```bash
   node integrations/zernio/zernio.mjs connect tiktok
   node integrations/zernio/zernio.mjs connect facebook
   ```

Requires Node 18 or later. There are no dependencies to install.

## Commands

| Command | What it does |
| --- | --- |
| `setup [platform]` | Find or create a profile, then print a connect link |
| `profiles` | List profiles |
| `connect <platform> [--profile <id>]` | Print a connect link |
| `accounts [--profile <id>]` | List connected accounts with their `accountId` |
| `post --content "..." --account instagram:<accountId>` | Save a post as a **draft** |
| `post ... --at 2026-12-01T18:00:00Z` | Schedule it (timezone defaults to `Africa/Accra`) |
| `post ... --now` | Publish immediately |
| `post ... --media https://...` | Attach media (a public HTTPS URL, repeatable) |

`--account` can be repeated to cross-post, for example `--account instagram:abc --account tiktok:def`.

## Using it from an agent

Add this section to a marketing agent, such as `marketing/marketing-multi-platform-publisher.md` or `marketing/marketing-social-media-strategist.md`:

```markdown
## Publishing via Zernio

- List connected accounts with `node integrations/zernio/zernio.mjs accounts` before you post.
- Save every post as a draft first and show it to the user. Use `--now` or `--at` only after the user approves the exact text, media and time.
- Brand voice for Demure Fragrance customers is English, warm and close to people.
- Never print, log or ask for the value of ZERNIO_API_KEY.
```

The module also exports `ensureProfile`, `getConnectUrl`, `listAccounts` and `createPost` for use from other Node scripts:

```js
import { ensureProfile, getConnectUrl } from "./integrations/zernio/zernio.mjs";

const { profile } = await ensureProfile();
const { authUrl } = await getConnectUrl("instagram", { profileId: profile._id });
```
