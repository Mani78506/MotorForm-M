# MotorForm native app

Android and iOS app built with Expo and React Native. The app uses the MotorForm catalog and enquiry API. Shortlists and enquiries follow an installation-specific identity held in Expo SecureStore.

```sh
npm ci
npm run typecheck
npm run bundle
npm start
```

Run Metro from this directory and open the project in a compatible Expo Go or development build on a phone. An Android internal distribution APK can be built by a signed-in Expo project owner with `npx eas-cli build --platform android --profile preview`. The EAS project link and distribution credentials are configured in that owner's Expo account.

The catalog currently contains sample estimates. The car photos are model references and may depict a different trim or colour.
