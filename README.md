# Love Fest Athlete Profiles

A static athlete profile browser for `competition_data.csv`.

## Run On GitHub Pages

1. Push these files to a GitHub repository:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `competition_data.csv`
   - `sandbagging_analysis_by_athlete.csv`
2. In GitHub, open `Settings` > `Pages`.
3. Under `Build and deployment`, choose:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/root`
4. Save.

GitHub will give you a public URL after the first deploy. The app does not need Python, Node, or a database when hosted this way.

## Updating Data

Regenerate `competition_data.csv` and `sandbagging_analysis_by_athlete.csv`, commit the updated CSV files, and GitHub Pages will serve the new data.

## Local Preview

Opening `index.html` directly from your computer may not load the CSV because of browser security rules. For local preview, run:

```bash
node server.js
```

Then open `http://127.0.0.1:8000`.
