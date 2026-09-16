# FamFin mobile app — build & API URL

## How the app finds the API
`src/services/api.ts:10-18` resolves the base URL in this order:
1. `EXPO_PUBLIC_API_URL` (env) — used for standalone builds and CI
2. Metro host (`Constants.expoConfig.hostUri`) — used automatically during
   `expo start` / `npx expo run` dev
3. Fallback `http://localhost:4000`

Because `EXPO_PUBLIC_*` values are **inlined at build time**, the URL in a build
is fixed when the build runs. Change URL → rebuild.

## Dev (`expo start`, Expo Go)
Optional. Set once in `family-cashflow/.env`:
```
EXPO_PUBLIC_API_URL=http://10.94.9.30:4000
```
When unset, dev just uses the Metro host (works on LAN).

## Standalone build (APK / IPA) with EAS
Requires an API reachable over **public HTTPS** (deploy the `deploy/` backend to
Render/Cloud Run/Fly; see `../deploy/README.md` — the standalone binary cannot
reach `localhost`, and iOS blocks plain-HTTP).

### 1. Point the env var at the deployed HTTPS URL
Externalize it (recommended, keeps it out of git):
```
eas secrets:set EXPO_PUBLIC_API_URL
```
then in `eas.json` reference the secret:
```json
{
  "build": {
    "production": {
      "env": { "EXPO_PUBLIC_API_URL": "$EXPO_PUBLIC_API_URL" }
    }
  }
}
```
Or commit it directly in `eas.json` (`build.production.env`).

### 2. Build
```
npm i -g eas-cli
eas login
eas build:configure          # no-op if eas.json exists
eas build --platform android # free on EAS free tier; outputs APK/AAB
eas build --platform ios     # needs Apple Developer ($99/yr) + signing; free tier can't build iOS
```
Android: install the APK on the phone (side-load) or upload AAB to Play Console.
iOS: requires Apple Developer Program membership; distribute via TestFlight/App Store.

## Local standalone test without the cloud build
Build the Android bundle locally (`npx expo export --platform android`, or
`npx expo run:android` via Android Studio), set `EXPO_PUBLIC_API_URL` in the
shell first, and it will use your HTTPS API.
