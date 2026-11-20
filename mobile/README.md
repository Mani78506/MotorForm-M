# Run MotorForm on your phone

MotorForm is a native Expo SDK 58 app that connects to the deployed Hyderabad catalog API.

1. On your computer, open a terminal in the repository's `mobile` directory. Use Node.js 22 LTS.
2. Run the commands below and leave the terminal open.
3. With tunnel mode, the phone and computer do not need to be on the same Wi-Fi. Scan the terminal's QR code with the current Expo Go app (SDK 58).

```powershell
# Use the .cmd executables in Windows PowerShell. They work even when the
# machine's PowerShell execution policy blocks npm.ps1.
npm.cmd ci
npx.cmd expo start --tunnel ngrok --clear
```

[Expo Go for Android](https://expo.dev/go?device=true&platform=android&sdkVersion=58)

`--tunnel ngrok` is the most reliable option when scanning from a phone: it does not require the phone and computer to be on the same Wi-Fi, and it works without an Expo account. Wait for the QR code, then scan it using the current Expo Go SDK 58 app. Alternatively, sign in with `npx.cmd expo login` and use `npx.cmd expo start --tunnel --clear`.

## Checks and builds

```sh
npm run typecheck
npm run bundle
```

To create an internal Android APK through Expo, link the project to your Expo account and run `npx eas-cli build --platform android --profile preview`. The selected Expo account manages the build credentials.

The app uses a per-installation identity kept in SecureStore for saved cars and enquiries. Browsing and recommendations are public. Prices include sourced estimates where available. Equipment and upgrade fitment remain illustrative.
