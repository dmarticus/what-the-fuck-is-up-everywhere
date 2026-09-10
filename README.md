# what is up

A separate, static GIF maker inspired by the [greatest video of all time](https://www.youtube.com/watch?v=xbPwaAFHDG8)
Enter a place or group, preview an animated scene, and download a captioned GIF.

## Run

Use Node.js 22.12 or later.

```sh
npm ci
npm run dev
```

Open the address printed by Vite.
To make a production build, run `npm run build`.
Serve `dist/` from any static host, or use `npm run preview` to check it locally.
Open the site over HTTP or HTTPS, not as a local file.
Clipboard access needs HTTPS or localhost.

## What it does

- Matches input keywords to a diner, office, city, gym, space, crowd, or group-chat scene.
- Uses the original clip for the diner when it is available.
- Uses original animated illustrations for the other scenes.
- Accepts local JPG, PNG, or WebP photos and adds motion to them.
- Exports 2, 3, or 4 seconds at 12 frames per second, in three shapes.
- Copies a link to the caption and settings. Photo versions must be shared as downloaded GIFs.

Matching uses a small keyword list, not a language model or AI video generation.
Unknown text uses the crowd scene. Users can choose a better scene or add a photo.
City scenes show a generic skyline, not a view of a specific city.
Photos and captions stay in the browser. There are no accounts, uploads, or analytics.
Captions in shared links use the URL fragment, which is not sent to the static host.
Google Fonts is the only external browser request; system fonts are used if it is blocked.

## Source clip

The clip comes from the [Imgflip template supplied for this project](https://imgflip.com/memetemplate/477170333/Dennys).
The app links to it and to the [original video](https://www.youtube.com/watch?v=9t1aUWlT1TI).
The startup and build scripts download that one fixed source to `public/media/original.mp4`.
The clip is excluded from version control. No third-party media ownership is claimed.
If the download fails, the app uses an illustrated diner.
To omit it, remove the media preparation step from the package scripts and remove the local clip.

## Implementation

React and TypeScript run on Vite. Canvas draws both the preview and export frames.
`gifenc` encodes frames in a worker, one at a time, to keep the page responsive and bound memory use.
Users can cancel an export. A failed export leaves the editor available for retry.
All uploaded images stay local. Inputs accept at most 60 characters; photos are limited to 10 MB and 24 megapixels.
The app respects reduced-motion settings for the preview. GIF exports contain motion and have no sound.

## Scope

This project is not part of the PostHog application and uses no PostHog project data.
It requires no API keys, backend, or paid services.
