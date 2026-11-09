# Bookmarker

A reading tracker that keeps your place in every book.

- **Library with accounts.** Each person signs up and gets a private library: reading now, up next, finished.
- **Save your place with a photo.** Photograph the page you stopped on; the app reads the printed page number and updates your progress.
- **Find your page from memory.** Describe the last thing you remember reading and the app finds the page and shows you the passage to confirm.
- **Add books three ways.** Search the Open Library catalog, photograph the cover or barcode, or type the details in.

There is no database to set up. Everything is stored as JSON files in a `data` folder next to the app, and sign-in is built in.

## Run it

You need [Node.js](https://nodejs.org) 20.9 or newer.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000 and create an account. The library, progress tracking and text import work straight away.

### Turn on the AI features

Reading page photos, reading covers and "find my page" use Claude.

1. Sign in to the Claude Console at https://platform.claude.com.
2. Buy some credit on the Billing page. API usage is prepaid and separate from a Claude chat subscription; a few dollars covers a lot of testing.
3. Open **API keys**, create a key, and copy it. It is shown only once.
4. Put it in `.env.local` as `ANTHROPIC_API_KEY=sk-ant-...` and restart the app.

Treat the key like a password. It belongs in `.env.local` or your host's settings, never in code you share.

## Where your data lives

```
data/
  accounts.json                         every account and sign-in session
  users/<user id>/library.json          that reader's books, reading history and AI allowance
  users/<user id>/passages/<book id>.json   a book's searchable text (imported text and photographed pages)
```

- **Back up** by copying the `data` folder. **Move** the app by copying it to the new machine.
- Passwords are stored only as salted scrypt hashes, and session cookies only as hashes, so the files don't contain anything that can be used to sign in directly.
- The files are readable JSON. You can open them to see exactly what is stored. Don't edit them while the app is running.
- Set `DATA_DIR` to keep the folder somewhere else.

### What this storage is good for, and what it isn't

- **One running copy of the app must own the folder.** The app queues writes so requests can't overwrite each other, but two copies writing the same folder can.
- **It suits a household, a book club or a class**, not thousands of readers. Each change rewrites that reader's library file, and every sign-in check reads `accounts.json`.
- All storage code is in `lib/store/`. Swapping in a hosted document database (MongoDB, Firestore) means rewriting those three files; nothing else touches the disk.

## Put it online

The app needs a host that gives it **a disk that persists and a single long-running process**:

- A small server or VPS, or a home machine: `npm run build`, then `npm start` (set `PORT` to choose the port).
- Railway, Render or Fly.io, with a volume attached and `DATA_DIR` pointing at it.

**Serverless hosts such as Vercel and Netlify will not work**: they don't keep files between requests, so accounts and books would vanish.

Serve it over https. The sign-in cookie is marked secure in production, so it is only sent over https (or on `localhost`). If you must use plain http on a network address, set `INSECURE_COOKIES=true`.

### Accounts

- Anyone who can reach the site can create an account. After making yours, set `ALLOW_SIGNUPS=false` to close sign-up.
- The app sends no email, so there is no "forgot password" link. To reset someone's password, run this on the server:

  ```bash
  node scripts/set-password.mjs reader@example.com "their new password"
  ```

- Eight wrong passwords for one email locks sign-in for that email for 15 minutes.

## How "find my page" works

The answer is only as good as the text the app has for that book. It tries three sources in order:

| What the app has | What happens | Accuracy |
|---|---|---|
| The book's text, imported from an EPUB or `.txt` file | Searches the text for the scene, then Claude picks the matching passage | Exact passage; the page is scaled to your edition's length |
| Pages you've photographed | Searches the text of those pages | Exact, with the printed page number, but only for pages you've photographed |
| Neither | Claude estimates from what it knows about the book | Rough, and unreliable for obscure books. The result is labelled as an estimate |

Things worth knowing:

- **Importing text.** On a book's page, use **Import the book's text**. The file is unzipped and read in the browser; only the text is sent to the server and stored in that reader's folder. Use copies you own. EPUBs with copy protection (most Kindle and Kobo purchases) can't be read. Public-domain books from Project Gutenberg work well, as `.txt` or EPUB.
- **Page numbers from imported text are approximate.** An EPUB has no page numbers, so the app works out how far through the text the passage is and applies that to the page count you entered for your copy. Expect to be within a page or two. Front matter in the file shifts it slightly.
- **Search is keyword-based.** The app asks Claude for words the passage probably contains (names, places, objects, synonyms), ranks the book's passages against them with its own search (`lib/search.ts`), and has Claude choose among the best 14. Descriptions that name a character, place or object work best. A purely abstract description ("the part where she felt sad") may miss.
- **Spoilers.** Results show only the matched passage, and the estimate prompt forbids mentioning later events.
- **Photos aren't kept.** A page photo is shrunk in the browser, read once, and discarded. Only the page number and text are saved.

## Costs and limits

- Each signed-in reader can make 60 AI requests a day (photo reads, cover reads and page searches each count as one). Change it with `AI_DAILY_LIMIT`.
- A page photo or page search costs on the order of a cent or two at current Claude prices. Check your Console usage page after a few days of real use.

## What has and hasn't been tested

**Automated tests** (`npm test`, 38 tests): the JSON store against a real folder (accounts, password hashing, sessions, privacy between readers, ids that try to escape the data folder, progress, simultaneous writes, text import, search, the AI allowance, the password-reset script), plus EPUB and text parsing, search ranking, reading stats, and the decision logic of "find my page".

**The whole app in a real browser**, as a production build: sign-up, sign-in and sign-out, adding a book, saving a page, importing a text file, finding a page from a description, saving a page from a photo, and a second reader being unable to open, search or change the first reader's book. For this run the Claude API was replaced by a stand-in that returned canned answers.

**Not yet tested:**

- Real Claude responses. The app's requests are well-formed, but how accurately Claude reads your page photos and picks passages is unknown until you try it. The prompts are all in `lib/ai.ts` if they need tuning.
- The Open Library catalog search, which couldn't be reached from where this was built. Its failure message was tested; its results were not.

## Where things are

```
app/
  page.tsx                  Landing page
  login/, signup/           Sign-in screens
  auth/actions.ts           Sign-up, sign-in, sign-out
  (app)/library/            Library and add-a-book screens
  (app)/books/[id]/         A book's page
  api/                      Catalog search, cover reading, page reading, text import, "find my page"
  actions.ts                Saving books, pages and scans
components/                 Screens and their parts (ForeEdge is the progress marker)
lib/
  store/                    JSON storage: files.ts (engine), accounts.ts, library.ts
  auth.ts                   The session cookie
  ai.ts                     Every Claude prompt
  locate.ts                 "Find my page" decision logic
  search.ts, chunk.ts, epub.ts   Text search and import
scripts/set-password.mjs    Reset a reader's password
tests/                      Automated tests
proxy.ts                    Sends signed-out visitors to the sign-in page
```

Useful commands: `npm run dev`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm start`.

## Not built yet

- PDF import, and one-click import of public-domain texts.
- Email: confirmation, password reset by link, and social sign-in.
- Meaning-based (embedding) search, which would handle vaguer descriptions.
- Deleting an account from inside the app (for now, remove the user from `data/accounts.json` and delete their folder while the app is stopped).
