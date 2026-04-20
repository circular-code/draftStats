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
