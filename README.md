# what the fuck is up, denny's

A browser-based AI video and GIF maker inspired by the [greatest video of all time](https://www.youtube.com/watch?v=xbPwaAFHDG8).
Describe a scene, generate a video with fal.ai, then trim it and export a captioned GIF.

## Run

Use Node.js 24 or later.

```sh
npm ci
cp .env.example .env
npm run dev
```

Open `http://127.0.0.1:5180`.
The command starts Vite and the local video API together.
It stops with an error if the port is occupied, rather than silently choosing a different one.
You can change `DEV_PORT` and `API_PORT` in `.env`.

For AI generation, add a [fal.ai key](https://fal.ai/dashboard/keys) to `.env`:

```dotenv
FAL_KEY=your-key-here
```

Restart the server after changing the key.
Do not use a `VITE_` prefix for this key: those variables are exposed to the browser.
Generation uses your fal.ai credits. The app shows a payment confirmation before submission.
Without a key, you can still open a local video, edit captions, export a GIF, or use Quick GIF mode.

For a built version, run `npm run build`, then `npm start`.
Open `http://127.0.0.1:5181`.
The AI version needs the Node server; hosting `dist/` alone does not enable generation.

## What it does

- Generates 5- or 10-second videos through fal.ai's Wan 2.5 text-to-video and image-to-video endpoints.
- Supports visual style, camera motion, resolution, aspect ratio, negative prompts, seeds, and optional prompt expansion.
- Uses an optional reference image as the first frame. The preview shows its center crop for the selected video shape.
- Saves generation history, settings, returned seeds, and completed videos locally. Queued jobs resume after a server restart.
- Trims generated or local videos, changes playback speed, and adds captions with position and color controls.
- Exports captioned GIFs at 12 or 18 fps. Original MP4 downloads do not include captions added in the editor.
- Keeps the original clip and preset scenes in Quick GIF mode. This mode does not call fal.ai.

AI output quality depends on the model and prompt. The app does not guarantee readable text, exact likenesses, or a seamless loop.
Captions are drawn after generation so the model does not need to render them.
Reference images are sent to fal.ai only after you confirm permission and select Generate.
Local videos used for GIF editing are not uploaded.
GIFs have no sound. Original video downloads keep the provider's output.

## Safety and storage

This is a personal, localhost-only server, not a public multi-user service.
It binds to `127.0.0.1`, rejects non-local hosts and cross-origin requests, and protects writes with a session token.
Do not expose it through a public tunnel. Add authentication, per-user billing limits, and production storage before public hosting.

The default limit is 10 submissions per UTC day across the server, with one active video per browser session and two in total.
Set `FAL_DAILY_LIMIT` in `.env` to change the daily limit.
The app does not automatically retry a paid submission. Retrying a lost response uses the same request ID.
If submission is uncertain, check your [fal.ai request history](https://fal.ai/dashboard/requests) before making another video.
Closing the page does not cancel a provider request. Keep the Node server running to save the result.

`.data/` contains prompts, settings, request IDs, browser ownership hashes, and downloaded videos.
Reference image bytes are not saved there. `.env` and `.data/` are excluded from Git.
History belongs to a browser cookie, so clearing cookies or switching between `localhost` and `127.0.0.1` hides that browser's history.
To clear stored data, stop the server and remove `.data/`. Download files you want to keep first.
Completed videos are limited to 100 MB. Local videos are limited to 60 MB and 60 seconds; reference images to 10 MB and 24 megapixels.

Optional PostHog AI observability is off by default.
To enable it, set both `POSTHOG_API_KEY` and `POSTHOG_HOST` for your own project.
It records model, status, latency, requested duration, resolution, and whether a reference was used.
It does not record prompts, captions, image bytes, output URLs, or API keys.
No token counts or costs are invented for video calls.
Google Fonts loads the interface fonts; system fonts are used if it is blocked.

## Implementation

React and TypeScript run on Vite. A Node server uses the official fal.ai client with server-only credentials.
The endpoint, safety checker, and accepted model settings are controlled by the server.
Atomic local files preserve request IDs before the provider is called, so a reload cannot silently duplicate a charge.
Generated media comes only from fal.ai's media hosts, is cached locally, and is served with byte-range support for trimming.
Canvas draws the same captions in the preview and GIF. `gifenc` encodes one frame at a time in a worker.
GIFs are capped at 640 pixels wide and 960 pixels tall. You can cancel an export without canceling a paid generation.
