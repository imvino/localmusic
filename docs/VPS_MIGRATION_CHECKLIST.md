# VPS Migration & "Torbox" Strategy Checklist

## 1. Code Refactoring (Immediate)
- [x] **Extract Secrets:** Move `TMDB_API_KEY` and `YOUTUBE_API_KEY` from `downloader.js` and `server.js` into a `.env` file.
- [x] **Generalize Paths:** Replace hardcoded `/Volumes/samsung/Music` with a configurable environment variable (e.g., `process.env.MUSIC_DIR`).
- [ ] **Renaming:** Global search and replace "localmusic" or "tormusic" with **torsongs**.

## 2. Infrastructure Setup
- [ ] **Choose Host:** Select an offshore provider (AlexHost, Shinjiru, or Hostoy).
- [ ] **Anonymous Signup:** Use a burner email and pay with Cryptocurrency (BTC/XMR) to avoid a paper trail.
- [ ] **Server Hardening:** 
    - [ ] Disable root SSH login.
    - [ ] Set up a firewall (UFW) to only allow ports 80, 443, and your SSH port.
    - [ ] Install Nginx as a reverse proxy for the Node.js app.

## 3. Domain & Connectivity
- [ ] **Purchase Domain:** Buy a non-US TLD (e.g., `.to`, `.li`, `.is`).
- [ ] **Domain Privacy:** Ensure "WHOIS Privacy" is enabled (usually free with offshore registrars).
- [ ] **Secondary Domains:** Buy 1-2 cheap backup domains (e.g., `.xyz`) for rotation if the main one is blocked.

## 4. Legal & Public Positioning
- [ ] **README:** Update `README.md` to describe the app as a "Personal Music Library Manager" or "Metadata Organizer."
- [ ] **License:** Add an MIT or GPL license.
- [ ] **Disclaimer:** Add a "For Educational Use Only" notice to the landing page and repository.

## 5. Security (Maintenance)
- [ ] **No Logs:** Configure Nginx/Node.js to minimize access logs that store user IP addresses.
- [ ] **Automated Backups:** Set up a script to backup `music-library.json` to a separate encrypted location.

## 6. Environment Setup
- [ ] **Create .env file:** Copy `.env.example` to `.env` and fill in your actual API keys.
- [ ] **Add to .gitignore:** Ensure `.env` is in `.gitignore` (already done).
- [ ] **Install dotenv:** Add `dotenv` package to `package.json` and require it at the top of `server.js` and `downloader.js`.
