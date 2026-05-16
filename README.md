# BreathHold Trainer

A cross-platform Expo app for dry static freediving practice.

## What it does

- Generates adaptive **CO₂ tables**, **O₂ tables**, **technique sessions**, **PR prep**, and a **mixed weekly structure**
- Lets you tune for **beginner / intermediate / expert** difficulty
- Lets you adjust **aggressiveness**
- Includes a built-in **guided round timer** with spoken **breathe**, **hold**, and **halfway** cues
- Surfaces concise recovery guidance and an **8-week progression**

## Safety framing

This app is for **dry training support**.

- No hyperventilation
- Never train in water alone
- Stop for tunnel vision, hearing fade, tingling, confusion, panic, or loss of control
- Not medical advice

## Local development

```bash
npm install
npm run web
```

For device testing:

```bash
npm run ios
npm run android
```

## Typecheck

```bash
npm run typecheck
```

## Static web export

```bash
npm run build:web
```

That writes the production web build to `dist/` and copies `index.html` to `404.html` for GitHub Pages refresh support.

## GitHub Pages publishing

This repo includes a GitHub Actions workflow at `.github/workflows/deploy.yml`.

### Expected repo name

The config defaults to a GitHub Pages base path of:

```text
/breathhold-trainer
```

If you publish from a differently named repo, set `EXPO_PUBLIC_BASE_PATH` in the workflow or update `app.config.ts`.

### Publish steps

1. Push the repo to GitHub.
2. In GitHub, open **Settings → Pages**.
3. Set **Source** to **GitHub Actions**.
4. Push to `main`.
5. The workflow will build and deploy the site.

Your site should end up at something like:

```text
https://<your-user>.github.io/breathhold-trainer/
```

## Notes

- iPhone + Android support is via Expo / React Native.
- For native store builds later, this project can be extended with EAS build config.
