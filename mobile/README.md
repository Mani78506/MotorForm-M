# Run MotorForm on your phone

MotorForm is a native Expo SDK 54 app that connects to the deployed Hyderabad catalog API.

1. On your computer, open a terminal in the repository's `mobile` directory. Use Node.js 22 LTS.
2. Run the commands below and leave the terminal open.
3. Connect the phone and computer to the same Wi-Fi network. Use an Expo Go build compatible with SDK 54 and scan the terminal's QR code.

```sh
npm ci
npx expo start --lan
```

[Expo Go SDK 54 for Android](https://expo.dev/go?device=true&platform=android&sdkVersion=54)

If the phone cannot reach the computer over Wi-Fi, try `npx expo start --tunnel` from the same directory. A tunnel requires the Expo CLI's ngrok dependency and a reachable ngrok service.

## Checks and builds

```sh
npm run typecheck
npm run bundle
```

To create an internal Android APK through Expo, link the project to your Expo account and run `npx eas-cli build --platform android --profile preview`. The selected Expo account manages the build credentials.

The app uses a per-installation identity kept in SecureStore for saved cars and enquiries. Browsing and recommendations are public. Prices include sourced estimates where available. Equipment and upgrade fitment remain illustrative.
