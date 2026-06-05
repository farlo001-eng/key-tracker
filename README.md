# Key Tracker

A simple web app for tracking which apartment units have keys, built for field use by interns on mobile.

## Features
- Browse all 29 properties and ~922 units
- Tap ✓ Has Keys or ✗ No Keys for each unit
- Progress tracking per property and overall
- Filter by Pending / Has Keys / No Keys
- Each intern enters their name — all checks are attributed
- Export all results to CSV at any time

## Deploy to Railway

1. **Push this folder to a GitHub repo**
2. **Go to [railway.app](https://railway.app)** and create a New Project → Deploy from GitHub repo
3. **Add a Volume** (so the database survives redeploys):
   - In your Railway service → go to **Volumes**
   - Add a volume mounted at `/data`
4. Railway will auto-detect Node.js and run `npm start`
5. Click **Generate Domain** to get a public URL — share it with your interns

## Local Development

```bash
npm install
npm start
# Open http://localhost:3000
```

## Data Persistence

The SQLite database is stored at:
- **Railway**: `/data/keys.db` (on the attached Volume)  
- **Local**: `./keys.db`

The app auto-seeds all units on first run. Checks are stored permanently in the database.

## Exporting Results

Visit `/api/export` or click **Export CSV** in the header to download all results.
