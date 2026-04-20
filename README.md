# DraftStats Prototype

Small vanilla JS app for tracking limited events, matchups, and player stats with Firebase-backed data and authentication.

- mobile-first date selection
- existing-event hints on the selected date
- existing-event reselection
- background creation of a new event when `date + set + index` is unique
- duplicate warning when the combination already exists
- Google sign-in and email/password sign-in
- player-facing nicknames stored separately from auth credentials
- Firebase persistence for users, events, profiles, and match entries

## Run

Firebase Auth will not work when the app is opened directly from `file://`.

Serve the folder with a static file server instead, for example:

```powershell
cd C:\Users\steph\code\DraftStats
python -m http.server 4173
```

Then open [http://localhost:4173/index.html](http://localhost:4173/index.html).
