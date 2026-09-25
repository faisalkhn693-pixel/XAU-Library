# XAU Library

An installable, offline-first XAUUSD trading journal. Setup records and screenshot images are stored in the browser's IndexedDB on the current device. No account, server, paid API, or remote database is used. GitHub holds application code only.

## Run locally

Serve this directory over HTTP (service workers require a secure context; `localhost` is supported). For example:

```sh
npx serve .
```

Open the local URL in a modern browser. On iPhone, open the deployed HTTPS site in Safari and choose **Share → Add to Home Screen**. Load it once online to cache the app shell; journal records remain available offline.

## Data and backups

- Setup records, drafts, and screenshots stay in browser storage on the device. Clearing browser website data can remove them, so export a JSON backup regularly.
- JSON backups contain screenshot image data. Import validates the backup before replacing local setups.
- CSV export includes setup fields and notes; use JSON to preserve screenshots and full fidelity.
- Timestamps are stored as UTC instants and rendered in Pakistan Standard Time.

The versioned setup model keeps user-entered data separate from the reserved `genie.interpretation` and `genie.userReview` fields for future analysis workflows. No AI integration is active.
