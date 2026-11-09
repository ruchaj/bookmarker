# Bookmarker

A reading tracker that keeps your place in every book.

- **Library with accounts.** Each person signs up and gets a private library: reading now, up next, finished.
- **Save your place with a photo.** Photograph the page you stopped on; the app reads the printed page number and updates your progress.
- **Find your page from memory.** Describe the last thing you remember reading and the app finds the page and shows you the passage to confirm.
- **Add books three ways.** Search the Open Library catalog, photograph the cover or barcode, or type the details in.

## Set it up

You need three free accounts: [Supabase](https://supabase.com) (database and sign-in), the [Claude Console](https://console.anthropic.com) (AI), and [Vercel](https://vercel.com) (hosting). Allow about 20 minutes.

### 1. Create the database

1. In Supabase, create a new project.
2. Open **SQL Editor**, paste the whole of `supabase/migrations/0001_init.sql`, and run it.
3. Open **Project Settings → API Keys** and copy the **Project URL** and the **publishable** key. (On older projects this is called the `anon` key; it works the same.)

### 2. Get a Claude API key

In the Claude Console, create an API key and add some credit. Every photo read and every "find my page" search is billed to this key, so see [Costs and limits](#costs-and-limits).

### 3. Run it on your computer

```bash
cp .env.example .env.local   # then paste your three values into .env.local
npm install
npm run dev
```

Open http://localhost:3000 and create an account.

Menu names in Supabase change now and then; look for the nearest match if one has moved.

Supabase's built-in email service only sends a few confirmation emails per hour. While you're testing, you can turn off **Authentication → Sign In / Providers → Email → Confirm email** so new accounts work straight away.

### 4. Put it online

1. Push this folder to a GitHub repository and import it in Vercel.
2. In Vercel, add the same three environment variables from `.env.local`.
3. Deploy, then copy your site's address.
4. Back in Supabase, open **Authentication → URL Configuration**. Set **Site URL** to your site's address and add `https://your-site.example/**` under **Redirect URLs**. Without this, the confirmation link in sign-up emails points at localhost.

Before inviting other people, set up your own email sender in Supabase (**Authentication → Emails → SMTP Settings**) so confirmation emails aren't rate-limited.

## How "find my page" works

The answer is only as good as the text the app has for that book. It tries three sources in order:

| What the app has | What happens | Accuracy |
|---|---|---|
| The book's text, imported from an EPUB or `.txt` file | Searches the text for the scene, then Claude picks the matching passage | Exact passage; the page is scaled to your edition's length |
| Pages you've photographed | Searches the text of those pages | Exact, with the printed page number, but only for pages you've photographed |
| Neither | Claude estimates from what it knows about the book | Rough, and unreliable for obscure books. The result is labelled as an estimate |

Things worth knowing:

- **Importing text.** On a book's page, use **Import the book's text**. The file is unzipped and read in the browser; only the text is stored, in that user's private rows. Use copies you own. EPUBs with copy protection (most Kindle and Kobo purchases) can't be read. Public-domain books from Project Gutenberg work well, as `.txt` or EPUB.
- **Page numbers from imported text are approximate.** An EPUB has no page numbers, so the app works out how far through the text the passage is and applies that to the page count you entered for your copy. Expect to be within a page or two. Front matter in the file shifts it slightly.
- **Search is keyword-based.** The app asks Claude for words the passage probably contains (names, places, objects, synonyms), runs a PostgreSQL full-text search, and has Claude choose among the best 14 passages. Descriptions that name a character, place or object work best. A purely abstract description ("the part where she felt sad") may miss.
- **Spoilers.** Results show only the matched passage, and the estimate prompt forbids mentioning later events.
- **Photos aren't kept.** A page photo is shrunk in the browser, read once, and discarded. Only the page number and text are saved.

## Costs and limits

- Each signed-in user can make 60 AI requests a day (photo reads, cover reads and page searches each count as one). Change it with `AI_DAILY_LIMIT`. The count is enforced in the database, so it can't be bypassed from the browser.
- A page photo or page search costs on the order of a cent or two at current Claude prices. Check your Console usage page after a few days of real use.
- Anyone can sign up once the site is public. To keep it private, turn off **Allow new users to sign up** in Supabase after creating your own accounts.

## What has and hasn't been tested

Tested automatically (`npm test`, 29 tests):

- The database schema, run in an in-process Postgres: users can only see and change their own rows, progress updates, passage search, the AI request counter, and cascade deletes.
- EPUB and plain-text parsing, splitting text into passages, search-query building, reading stats, catalog result mapping, and the decision logic of "find my page" (with the AI and database stubbed).

Checked by hand in a browser with sample data and a mocked API: the landing page, library, book page, add-a-book flow, and the "find my page" result cards, at phone and desktop widths.

**Not yet run against live services:** sign-up and sign-in against a real Supabase project, real Claude API calls (reading photos, choosing passages), and the Open Library search. This code was written without access to those services. Run through each feature once after setup, and expect that the AI prompts in `lib/ai.ts` may want tuning once you see real results.

## Where things are

```
app/
  page.tsx                  Landing page
  login/, signup/           Sign-in screens
  auth/                     Sign-in actions and the email confirmation link
  (app)/library/            Library and add-a-book screens
  (app)/books/[id]/         A book's page
  api/                      Catalog search, cover reading, page reading, "find my page"
  actions.ts                Saving books, pages and scans
components/                 Screens and their parts (ForeEdge is the progress marker)
lib/
  ai.ts                     Every Claude prompt
  locate.ts                 "Find my page" decision logic
  search.ts, chunk.ts, epub.ts   Text search and import
  supabase/                 Database clients and session handling
supabase/migrations/        The database schema
tests/                      Automated tests
proxy.ts                    Keeps sessions fresh and gates signed-in pages
```

Useful commands: `npm run dev`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.

## Not built yet

- PDF import, and one-click import of public-domain texts.
- Password reset and social sign-in (Supabase supports both; the screens aren't built).
- Meaning-based (embedding) search, which would handle vaguer descriptions. The `passages` table is the place to add a vector column.
- Deleting an account from inside the app.
