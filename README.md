# Comfy Studio

A fashion styling studio built on [Comfy Router](https://docs.comfy.org/development/comfy-router/models). It turns a single photo into new looks, product flat lays and reusable pose references, all generated with **GPT Image 2.5 Sunburst** and upscaled with Comfy's upscalers.

Built with Next.js (App Router), React, TypeScript and Sharp. The UI follows the look of comfy.org/hub.

## What it does

The switch at the top of the sidebar selects one of three workflows. Each keeps its own photo, quality and output size.

### Try-on
Upload a full-body photo and dress the person in something new:

- **Outfits:** 16 built-in outfit presets (male and female collections) or your own reference images.
- **Single garments:** outerwear, tops, sets, bottoms, socks, shoes and accessories, from your own uploads.
- **Background:** plain studio colors.
- **Pose:** a mannequin pose reference. The model copies only the body position, never the mannequin's look.

The result keeps the person's identity and the photo's framing. A before/after slider compares it with the original.

### Flatlay
Upload a photo of a model wearing an outfit and choose what to extract: the complete outfit or any mix of outerwear, tops, bottoms, socks, shoes and accessories. You get a top-down product flat lay of exactly those items on a pure white background, with the person removed.

### Pose
Upload a photo of someone in a pose. You get the same shot with a faceless matte black mannequin in exactly that pose, framing and perspective. If the photo shows only the upper body, so does the mannequin. These images become pose references for try-on.

### Connecting the workflows
Flat lays and poses feed straight back into try-on:

- **Use as …** switches to try-on with the result selected. A flat lay of a single item goes into that item's category (only shoes goes to Shoes). A complete outfit or several items go to Outfit. Poses go to Pose.
- **Save** keeps the result as a sidebar tile in the browser, so it survives a reload. Saved tiles show a × on hover to delete them.

### Everything else
- **Quality:** Low, Med, High, XHigh or Max, the quality tiers of GPT Image 2.5 Sunburst (default High).
- **Output size:** Auto, 2K or 4K. Try-on and pose follow the photo's aspect ratio. Flat lays are always a 2:3 portrait.
- **Upscale:** 2K, 4K or 8K with the Ultimate Image Upscaler. Optionally, a custom SeedVR2 ComfyUI workflow runs on Comfy Cloud.
- **Last Generations:** the yellow tab on the right opens the history of the last 12 jobs: running and finished jobs with result, date, inputs, settings and request ID. Clicking an image restores it with its photo and all settings. The history is stored in the browser and survives a reload.
- **Download** and a copyable **request ID** for every result.

## Getting started

Requirements: Node.js 22.17 or newer and a Comfy workspace API key with credits.

1. Create a workspace API key at https://platform.comfy.org.
2. Copy `.env.example` to `.env.local` and set `COMFY_API_KEY`. The key stays on the server; never prefix it with `NEXT_PUBLIC_` or commit it.
3. Install and start:

```sh
npm ci
npm run dev
```

The app runs at http://localhost:3000. Without a key, generating stays disabled.

The dev and production servers run Node with `--use-system-ca`, so the Comfy connection also works behind a locally trusted HTTPS proxy.

### Checks and production build

```sh
npm run lint
npm test
npm run build
npm start
```

## How it works

### API routes
| Route | Purpose |
|---|---|
| `GET /api/generate` | Reports whether the server key is configured and which upscaler is active |
| `POST /api/generate` | Try-on: validates and normalizes photo and references, then queues the job |
| `POST /api/flatlay` | Flat lay from a photo and the chosen items |
| `POST /api/pose` | Mannequin pose from a photo |
| `POST /api/upscale` | Upscales a generated image |
| `GET /api/generate/[token]` | Status and result of any of the jobs above |

All jobs use Comfy Router's queued delivery: submit, poll the status, collect the result. The integration calls the documented HTTP API directly, without an SDK.

### Security and limits
- The API key never leaves the server. The browser gets a signed job ticket, valid for 24 hours, that only allows status checks for jobs this app started.
- Uploads are capped at 10 MB and 40 megapixels per file and 32 MB per request. Animated images are rejected.
- All images, including AVIF, are normalized to JPEG with EXIF data removed. The longest edge is capped at 2048 px.
- Submissions use idempotency keys, so retrying after a network error does not start a second paid job.

### Prompts
Each workflow builds its own prompt and numbers its reference images explicitly:

| Workflow | Prompt | Notes |
|---|---|---|
| Try-on | `src/lib/server/generation-input.ts` | Outfit presets are cut from the atlas `public/images/outfit-presets.png` on the server |
| Flatlay | `src/lib/server/flatlay-input.ts` | Item list in `src/lib/flatlay.ts` |
| Pose | `src/lib/server/pose-input.ts` | The first library mannequin is sent as the style reference |

### Pose library
Pose references are mannequin photos in `public/images/poses`, listed in `src/lib/poses.ts`. To add a pose, drop the image there and append an entry to that list.

### Upscaling
- **Default:** `wavespeed/ultimate-image-upscaler` through Comfy Router.
- **Optional:** set `COMFY_UPSCALER=seedvr2` in `.env.local` to run the custom ComfyUI workflow `src/lib/server/workflows/seedvr2-upscale.json` on Comfy Cloud through the Comfy API v2. This needs a paid Comfy Cloud plan.

The SeedVR2 workflow is exported from ComfyUI in API format:
- The image is uploaded as a Cloud asset and inserted into node 9 (Load Image).
- Resolution and seed are set on node 2.
- The result is read from node 5 (Save Image).

### Storage
Nothing is stored on a server. The browser keeps two IndexedDB stores:
- `history`: generations with their photos, references and settings.
- `library`: saved tiles.

Tiles uploaded with “+” last for the current session only.

### Output sizes
`src/lib/output-size.ts` computes explicit sizes:
- **2K:** longest edge 2048 px.
- **4K:** longest edge up to 3840 px, capped at 3840 × 2160 pixels in total.
- Both edges are always divisible by 16.

| Flat lay size | Pixels |
|---|---|
| Standard | 1024 × 1536 |
| 2K | 1360 × 2048 |
| 4K | 2336 × 3520 |

## Tests

`npm test` runs the unit and route tests with simulated Comfy responses. They cover:
- uploads, validation and image normalization
- preset cropping and the prompts of all three workflows
- quality and output sizes
- queue states, results and errors
- signed job tickets
- both upscalers

A real model run needs a valid key with credits.

## Project structure

| Path | Contents |
|---|---|
| `src/app` | Layout, page and API routes |
| `src/components` | UI: sidebar, photo stage, panels, history, buttons |
| `src/lib` | Shared types and settings: categories, poses, flat lay items, quality, sizes, IndexedDB storage |
| `src/lib/server` | Request validation, prompts, Comfy Router and Comfy Cloud clients |
| `public/images` | Comfy logo, outfit preset atlas, pose mannequins |
| `design` | Color tokens taken from comfy.org and the license of the category icons |
| `tests` | Node test runner suites |

The category icons are [Phosphor Icons](https://phosphoricons.com) (MIT). Instead of Comfy's licensed PP Formula, the app uses Inter, which comfy.org also ships.

## Status

This is a hackathon prototype without user accounts. Before deploying it publicly, the paid generation calls need access control and rate limits. Setting a spending limit on the Comfy workspace is recommended. The host must support Node.js, Sharp and request bodies up to 32 MB.
