# Comfy Studio

A fashion styling studio built on [Comfy Router](https://docs.comfy.org/development/comfy-router/models). It turns a single photo into new looks, product flat lays and reusable pose references, all generated with **GPT Image 2.5 Sunburst** and upscaled with Comfy's upscalers.

Built with Next.js (App Router), React, TypeScript and Sharp. An independent hackathon project using the Comfy Developer Platform; not an official Comfy product.

**[Watch the demo on YouTube](https://www.youtube.com/watch?v=3etvhP7Dc64)** · **[Visual walkthrough](#comfy-studio--visual-walkthrough)** · **[MIT license](LICENSE)** · **[Deployment and security notes](SECURITY.md)**

## Comfy Studio — visual walkthrough

Comfy Studio connects three workflows: try on clothes, extract product flat lays and create reusable pose references. All screenshots below are examples from the app, not guarantees of an identical model result.

### 1. Start the app

Follow the [setup instructions](#getting-started), add your own Comfy key to `.env.local`, and open the local URL. Pick **Try-on** in the sidebar. An AI-generated example model is already selected, so you can start by choosing your clothing reference. Click the photo to replace it with your own. JPG, PNG, WebP and AVIF are accepted, up to 10 MB each.

### 2. Select clothing

The **Outfit** panel opens with eight demo outfits for the selected Male or Female collection (16 total). Select a tile to try it on the example model, or use the **+** tile to upload an outfit image you have permission to use. You can also upload individual garments under Tops, Bottoms, Shoes and the other categories. Selected tiles appear in **Selected items** below the photo. Click a selected item to inspect it, or remove it with its remove control.

![Demo outfits and custom outfit uploads](docs/images/outfit-selection.jpg)

Choose output size and quality, then click **Generate**. Each submission uses your Comfy workspace credits. Do not start another job just because the first one is still queued; its status appears in the workspace and history.

### 3. Extract a flat lay

Switch to **Flatlay**, upload someone wearing an outfit, and choose the complete outfit or specific items. **Create flat lay** requests a product image on white. After it finishes, **Use as …** returns it to the appropriate Try-on category. **Save** keeps a library tile in this browser across reloads.

![Flatlay workflow and item selection](docs/images/flatlay.jpg)

Each workflow keeps its own uploaded photo, quality and output-size settings.

### 4. Create and apply a pose

Switch to **Pose** and upload a person in the desired posture. **Create pose** requests a faceless black mannequin with that posture and crop. Use or save the result, then select it under **Pose** in Try-on.

![Pose creation workflow](docs/images/pose-workflow.jpg)

For a try-on with a pose, the inputs have different roles:

- Person photo: identity and appearance.
- Garment images: clothes, colors, patterns and design.
- Pose figure: whole-body orientation, posture, camera view, placement and crop.

The prompt requests a new photograph based on the pose composition. A pose ending at the thighs requests the same crop; a full-body figure requests a full-body composition. The model can still interpret details differently; it is not a geometric pose-locking system.

### 5. Compare, upscale and download

After generation, enable the before/after comparison and drag the vertical divider. **Download** saves the result. **Upscale** offers the resolutions supported by the configured upscaler. The **Last Generations** tab opens the last 12 jobs; clicking one restores its inputs and settings.

![Interactive before/after comparison](docs/images/before-after.png)

The slider compares two images in the same display area. When the pose changes composition or aspect ratio, body features may not align across the divider.

### Where your images go

The application sends images to Comfy and the selected model provider to generate results. History and saved library tiles stay in this browser's IndexedDB. Clearing browser storage removes them.

## What it does

The switch at the top of the sidebar selects one of three workflows. Each keeps its own photo, quality and output size.

### Try-on
Use the preselected AI-generated example model or upload your own full-body photo, then dress the person in something new:

- **Outfits:** 16 author-supplied demo outfits across male and female collections, plus your own reference images.
- **Single garments:** outerwear, tops, sets, bottoms, socks, shoes and accessories, from your own uploads.
- **Background:** your own background reference images.
- **Pose:** a mannequin pose reference. The reference supplies the target posture, camera view, crop and aspect ratio; the person photo supplies identity and the clothing references supply the outfit.

Without a pose reference, the prompt preserves the original photo's pose and framing. With a pose reference, it requests a new composition based on that reference. A before/after slider compares the result with the original. Pose matching and identity preservation are model-guided and are not guaranteed to be exact; different compositions may not line up in the comparison slider.

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
- **Output size:** Auto, 2K or 4K. Try-on follows the person photo's aspect ratio unless a pose is selected, in which case it follows the pose reference. The Pose workflow follows its uploaded photo. Auto size leaves the final dimensions to the model. Flat lays are always a 2:3 portrait.
- **Upscale:** 2K, 4K or 8K with the Ultimate Image Upscaler. Optionally, a custom SeedVR2 ComfyUI workflow runs on Comfy Cloud.
- **Last Generations:** the yellow tab on the right opens the history of the last 12 jobs: running and finished jobs with result, date, inputs, settings and request ID. Clicking an image restores it with its photo and all settings. The history is stored in the browser and survives a reload.
- **Download** and a copyable **request ID** for every result.

## Getting started

Requirements: Node.js 22.17 or newer and a Comfy workspace API key with credits.

1. Create a workspace API key at https://platform.comfy.org.
2. Run `cp .env.example .env.local` and set `COMFY_API_KEY` in `.env.local`. The key stays on the server; never prefix it with `NEXT_PUBLIC_` or commit it.
3. Install and start:

```sh
npm ci
npm run dev
```

The app runs at http://127.0.0.1:3000. The development server binds only to the local machine. To use port 3001:

```sh
npm run dev -- --port 3001
```

Without a key, generating stays disabled. Each user running their own copy supplies their own Comfy key and credits; the example file contains no credentials.

The dev and production servers run Node with `--use-system-ca`, so the Comfy connection also works behind a locally trusted HTTPS proxy.

### Checks and production build

```sh
npm run lint
npm test
npm run build
# See the production configuration below before running npm start.
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

Try-on, Flatlay, Pose and the default upscaler use Comfy Router's queued delivery: submit, poll the status, collect the result. The optional SeedVR2 upscaler runs a workflow on Comfy Cloud. Both integrations call the HTTP API directly, without an SDK.

### Security and limits
- This hackathon prototype has no login or password gate. Anyone who can reach a deployed instance can use its shared generation quota.
- Production submissions require `APP_RATE_LIMIT_DIR`, an absolute directory on persistent storage outside `public/`. The four paid workflows share defaults of 6 submission attempts per minute and 50 per fixed 24-hour window. Unavailable storage fails closed. See [deployment details](SECURITY.md).
- The API key never leaves the server. The browser gets a signed job ticket, valid for 24 hours, that only allows status checks for jobs this app started.
- Uploads are capped at 10 MB and 40 megapixels per file and 32 MB per request. Animated images are rejected.
- All images, including AVIF, are normalized to JPEG with EXIF data removed. The longest edge is capped at 2048 px.
- Submissions use idempotency keys, so retrying after a network error does not start a second paid job.

### Prompts
Each workflow builds its own prompt and numbers its reference images explicitly:

| Workflow | Prompt | Notes |
|---|---|---|
| Try-on | `src/lib/server/generation-input.ts` | The chosen demo outfit is cropped from the lookbook; custom garment references are normalized on the server |
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
Photos and results are not persisted by the application server. Images are sent to Comfy and the selected model provider for processing; their service terms and retention policies apply. Production rate-limit counters are stored on disk and contain only window timestamps and counts, not photos or IP addresses.

The browser keeps two IndexedDB stores:
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
- uploaded references and the prompts of all three workflows
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
| `public/images` | Comfy logo, example model, demo outfit lookbook and pose mannequins |
| `design` | Color tokens taken from comfy.org and the license of the category icons |
| `tests` | Node test runner suites |

The category icons are [Phosphor Icons](https://phosphoricons.com) (MIT). Instead of Comfy's licensed PP Formula, the app uses Inter, which comfy.org also ships.

## Production configuration

The host must accept multipart uploads up to 32 MB and upscale JSON bodies up to 40 MB. Production builds download the Inter font and need network access.

Use a Node.js host with Sharp support and a persistent writable volume. Create a private directory on that volume and configure:

```dotenv
COMFY_API_KEY=your_own_workspace_key
APP_RATE_LIMIT_DIR=/var/lib/comfy-studio/limits
APP_REQUESTS_PER_MINUTE=6
APP_REQUESTS_PER_DAY=50
```

On Railway, attach a volume at `/data` and use `APP_RATE_LIMIT_DIR=/data/rate-limits`. The public HTTPS origin is detected from Railway's `RAILWAY_PUBLIC_DOMAIN`. For a custom domain or another reverse proxy, set `APP_ORIGIN=https://your-app.example.com` so browser requests are checked against the public URL rather than the internal container address.

Then run `npm run build` and `npm start`. Every app replica must use the same persistent directory with atomic filesystem operations; ephemeral/serverless storage is not supported by this limiter. Requests fail with 503 if production limit storage is not configured. Set a Comfy workspace spending limit too: job counts are not a monetary budget. See [SECURITY.md](SECURITY.md) for recovery and deployment constraints.

## License

Code is licensed under [MIT](LICENSE). Third-party assets and trademarks retain their respective rights; see [asset notes](public/images/README.md).
