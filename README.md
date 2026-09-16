## Standalone (signed APK/IPA) build

The API URL for a standalone build is taken from `EXPO_PUBLIC_API_URL`
(inlined into the binary at build time) — NOT from Metro. Two supported routes:

### A. EAS Build (cloud, recommended)
Set the URL once on the EAS side so it survives across machines/CI:

```
eas secrets:set EXPO_PUBLIC_API_URL
# value: https://your-deployed-api.onrender.com  (public HTTPS!)
```
or add it to `eas.json` under the profile you build (no quoting issues, but the
value then lives in the repo — prefer the secret).

Then:
```
eas build --platform android        # free, generates APK/AAB, no Android Studio
eas build --platform ios            # requires Apple Developer ($99/yr) + signing
```

### B. Local prebuild + export (kitchen, no cloud)
For a quick signed bundle without EAS:
```
EXPO_PUBLIC_API_URL=https://your-deployed-api.onrender.com npx expo export --platform android
# or set it once in family-cashflow/.env, then:  npx expo export --platform android
```
then wrap the output (tensorflow/web-standalone + android bundle) with your
Android Studio project.

Either way the app in a standalone build resolves
`EXPO_PUBLIC_API_URL` at build time, so anything reachable at
`https://<render-url>/health` works. For LAN/debug keep using the Expo Go +
Metro flow (hostUri) — the two behaviors are independent.