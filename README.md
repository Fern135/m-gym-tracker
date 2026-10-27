# Ironweek

Ironweek is a personal workout tracker for your phone that works completely offline: there's no account and no internet needed, and everything stays on your device. You create workouts (like "Upper Body" with its list of exercises) and put them on the days of the week you want to train. The app then shows what's on today and how your week is going, marking each day as done, skipped, missed or a rest day. When you start a workout, it walks you through each exercise one set at a time. You record your reps and weight, a rest timer counts down between sets, and the app tracks how long the session took. You can attach a short how-to video to any exercise, and if you skip a workout you can note why. Reminders on workout days help you stay on track, and the History tab shows everything you've done. Settings let you choose pounds or kilograms, a light or dark theme, and when reminders arrive, and you can export your workout history as a backup file.

A personal, offline workout tracker for iOS and Android, built with Expo.
Plan a weekly schedule, follow a guided workout with a rest timer, and get local
reminders on workout days. Everything is stored on the phone: no account, no server,
and no internet needed (except the optional "Search online" for exercise videos).

- **Today**: today's workout, this week at a glance, missed-workout warnings
- **History**: every completed, skipped and missed workout
- **Workouts**: templates with exercises and an optional how-to video per exercise
- **Schedule**: which workout falls on which weekday
- **Settings**: weight unit, reminders, theme, export and clearing data

Stack: Expo SDK 58, React Native, TypeScript, Expo Router, expo-sqlite, Zustand,
React Native Paper, expo-notifications, date-fns.

---

## 1. Requirements

| What | Version / notes |
|---|---|
| Node.js | **22.13 or newer** (Expo SDK 58 requires it; Node 20 shows a warning and may fail) |
| npm | Comes with Node. This project uses npm (`package-lock.json`) |
| A phone | iPhone or Android, for running the app |
| Expo Go app | Optional, from the App Store / Play Store, for the quickest start |
| Xcode | Only to compile **iOS** on your own Mac (macOS only) |
| Android Studio | Only to compile **Android** on your own computer |
| Expo account | Only to compile in the cloud with EAS (free plan works) |

## 2. Install

```bash
git clone <this repo>
cd m-gym-tracker
npm install
```

## 3. Run it (development)

### Option A: Expo Go (fastest, no compiling)

```bash
npx expo start
```

Scan the QR code with your phone camera (iOS) or the Expo Go app (Android).
The phone and computer must be on the same Wi-Fi, or run `npx expo start --tunnel`.

What doesn't work in Expo Go:

- The Android **exact rest alarm** ("Rest alarm on time" in Settings) needs a compiled build.
- Custom permission messages from `app.json` (camera, photo library) aren't shown.
- Notifications work, but Expo Go is a shared app, so test reminders on a real build before trusting them.

### Option B: Development build (all features)

A development build is your own copy of the app with all native features, still
reloading live from `npx expo start`. Compile it once (see section 4), then:

```bash
npx expo start          # press "i" or "a", or open the installed app
```

You only need to recompile when native settings change: a new native package,
or an edit to `app.json` plugins or permissions.

## 4. Compile the app

The `ios/` and `android/` folders are **generated** (and git-ignored). Never edit
them by hand; change `app.json` instead. Pick one of these two ways.

### Option 1: EAS cloud build (no Xcode or Android Studio needed)

```bash
npx eas-cli@latest login
npx eas-cli@latest build:configure        # first time only: creates eas.json
```

To get an **installable Android APK** you can sideload onto your phone, add this
profile to `eas.json` (inside `"build"`):

```json
"preview": {
  "distribution": "internal",
  "android": { "buildType": "apk" }
}
```

Then build:

```bash
# Android APK: download from the link EAS prints and open it on the phone
npx eas-cli@latest build -p android --profile preview

# Development build (the app from section 3, Option B)
npx eas-cli@latest build -p android --profile development
npx eas-cli@latest build -p ios --profile development

# Store builds
npx eas-cli@latest build -p android --profile production   # .aab for Google Play
npx eas-cli@latest build -p ios --profile production       # for the App Store / TestFlight
```

Check progress with `npx eas-cli@latest build:list` or on expo.dev.

Accounts:

- **Android APK**: no store account needed.
- **iOS on a real iPhone**: needs an Apple Developer Program membership ($99/year).
  EAS walks you through signing and registering your device (`npx eas-cli@latest device:create`).
- **Google Play**: one-time $25 developer account to publish.

### Option 2: Compile on your Mac and install by cable (nothing is uploaded)

Your Mac builds the app and installs it straight onto the phone over USB.
After the one-time setup, installing or updating is a single command.

#### Android phone

One-time setup:

1. Install **Android Studio** and open it once, so it downloads the Android SDK.
2. On the phone, turn on developer options: **Settings > About phone**, then tap
   **Build number** 7 times.
3. Turn on **Settings > System > Developer options > USB debugging**.
4. Plug the phone into the Mac and tap **Allow** on the "Allow USB debugging?" prompt.
   Check that the Mac sees it: `~/Library/Android/sdk/platform-tools/adb devices`
   should list the phone as `device`.

Install (run this again any time to update):

```bash
npm run phone:android
```

This builds a release version and installs it on the connected phone or the running
emulator. The first build takes 5 to 15 minutes; later ones are faster. The app stays
installed for good.

The script points the build at Android Studio's SDK (`~/Library/Android/sdk`) and at
the Java that ships with Android Studio, because React Native's Android build expects
JDK 17, not newer system Java versions.

The built file is at `android/app/build/outputs/apk/release/app-release.apk`.
You can also copy it to any Android phone and open it to install.

#### iPhone

One-time setup:

1. Install **Xcode** from the Mac App Store and open it once to accept the license.
2. Point the command-line tools at Xcode:
   `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`
3. Install CocoaPods (iOS library installer): `brew install cocoapods`
   (needs [Homebrew](https://brew.sh)). Check with `pod --version`.
4. In **Xcode > Settings > Accounts**, add your Apple ID. A free Apple ID works.
5. On the iPhone, turn on **Settings > Privacy & Security > Developer Mode**, and
   restart the phone when asked.
6. Plug the iPhone into the Mac, unlock it, and tap **Trust**.

Install (run this again any time to update):

```bash
npm run phone:ios
```

Pick your iPhone from the list if asked. The first time:

- If the build stops with a signing error, open `ios/Ironweek.xcworkspace` in Xcode, select
  the **Ironweek** target > **Signing & Capabilities**, choose your Apple ID under
  **Team**, then run the command again.
- If the app won't open on the phone, go to **Settings > General > VPN & Device
  Management**, tap your Apple ID, and tap **Trust**.

With a free Apple ID the app stops opening after **7 days**. Plug the phone in and
run `npm run phone:ios` again to renew it; your data stays. A paid Apple Developer
account ($99/year) extends this to a year.

#### If a build acts strangely

After changing native settings (`app.json` plugins or permissions, or a new native
package), regenerate the native folders, then install again:

```bash
npx expo prebuild --clean
```

## 5. Checks

Run these before committing:

```bash
npx tsc --noEmit       # typecheck
npx eslint .           # lint
npm test               # assert-based tests in lib/*.test.ts
npx expo-doctor        # dependency and config problems
```

Add packages with `npx expo install <package>`, not `npm install`, so the
versions match SDK 58.

## 6. Project layout

```
app/                    screens (Expo Router: every file is a route)
  (tabs)/               Today, History, Workouts, Schedule, Settings
  workout/log/[date]    log, guide or view the workout for a date
  workout/template/[id] create or edit a workout
components/             shared UI (week strip, rest timer, exercise video, ...)
lib/
  db.ts                 all SQL; schema and migrations
  settings.ts           typed settings access
  notifications.ts      all notification scheduling
  reminders.ts          pure reminder planning (tested)
  week.ts, today.ts     schedule, status and missed-workout logic (tested)
  media.ts              exercise videos stored in the app's documents folder
  export.ts             JSON export through the share sheet
  store.ts              Zustand store for settings the UI renders from
```

## 7. Data

- Data lives in an on-device SQLite database (`ironweek.db`). Uninstalling the app deletes it.
- Exercise videos are copied into the app's own documents folder, so deleting them
  from the camera roll doesn't break anything.
- Back up from **Settings > Export workout logs**. This exports logs as JSON; videos aren't included.
