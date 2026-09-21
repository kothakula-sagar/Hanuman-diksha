# Hanuman Disha · 108 Day Sadhana

A responsive glassmorphism + orange personal sadhana tracker built with HTML, CSS, JavaScript and Firebase.

## Included

- 108-day configurable journey
- Daily Todo tasks with time, required/optional flag and food/habit avoidance type
- Automatic daily completion state
- Exercise settings with scheduled time, duration, how-to video and completion records
- JAI SRI RAM video upload/replace in Settings, with no delete control
- Full-video completion tracking
- SITA RAM counter, 108 repetitions per cycle
- Color-coded calendar
- Responsive mobile/laptop UI
- PWA shell
- Firebase Authentication
- Firestore
- Firebase Storage
- Google Calendar support through recurring event links and `.ics` export

## Firebase setup

1. Open Firebase Console for project `tripsplit-2658e`.
2. Enable Authentication > Email/Password.
3. Create a Firestore database.
4. Create a Storage bucket.
5. Publish `firestore.rules` and `storage.rules`.
6. The Firebase web config is already in `firebase-config.js`.

Firebase web API keys are not secret credentials by themselves, but access is protected by Firebase Authentication and Security Rules. Keep the rules published.

## GitHub Pages

1. Create a GitHub repository.
2. Upload all files from this folder to the repository root.
3. In GitHub: Settings > Pages > Deploy from branch > main / root.
4. Open the generated Pages URL.
5. Sign in or create your Firebase account.

## Important behavior

- The app records daily data under `users/{uid}`.
- Required Todo + required Exercises + JAI SRI RAM are the default required activities.
- `resetOnMiss` is stored in Settings. This first implementation records missed days and displays the calendar state. A full automatic "reset to a new Day 1 start date" workflow should be finalized after deciding exactly what constitutes a missed day and whether the reset happens at midnight or immediately.
- Browser video playback cannot prove that a person listened, so completion is recorded only after the browser's video `ended` event.
- Google Calendar is used for reminders. The website cannot silently grant Calendar access. The `.ics` export and recurring Google Calendar event links avoid requiring a Google OAuth client ID.

## Data layout

users/{uid}/
- meta/settings
- meta/jai
- meta/sita
- todos/{todoId}
- exercises/{exerciseId}
- dailyRecords/{YYYY-MM-DD}


## Expenses & Borrowings

A dedicated money section is included. It intentionally has **no income feature**.

Expenses support:
- Amount
- Category
- Date
- Payment method
- Note

Borrowings support:
- Amount
- Borrowed from
- Date
- Outstanding / Settled status
- Note

Firestore collections:
- `users/{uid}/expenses`
- `users/{uid}/borrowings`

## Cloudinary media storage

JAI SRI RAM and exercise videos are uploaded directly to Cloudinary. Firebase stores only the Cloudinary public/secure URL plus media metadata.

Configure these under **Settings > Cloudinary media storage**:
- Cloudinary cloud name
- Unsigned upload preset

The same Cloudinary helper supports image uploads for future image features. Use a restricted unsigned upload preset and appropriate Cloudinary upload-folder restrictions.
