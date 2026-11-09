-- Bookmarker database schema.
-- Run this once in the Supabase SQL editor (or with `supabase db push`).
-- Every row belongs to one signed-in user, enforced by row-level security.

-- ---------------------------------------------------------------- tables

create table public.books (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 300),
  author      text check (author is null or char_length(author) <= 300),
  isbn        text check (isbn is null or char_length(isbn) <= 20),
  cover_url   text check (cover_url is null or char_length(cover_url) <= 500),
  total_pages integer check (total_pages is null or total_pages between 1 and 20000),
  current_page integer not null default 0 check (current_page >= 0),
  status      text not null default 'reading' check (status in ('want', 'reading', 'finished')),
  -- Name and size of the book text the reader imported, if any.
  text_name   text check (text_name is null or char_length(text_name) <= 300),
  text_chars  integer not null default 0 check (text_chars >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  finished_at timestamptz
);

create index books_user_idx on public.books (user_id, updated_at desc);

create table public.progress_events (
  id         uuid primary key default gen_random_uuid(),
  book_id    uuid not null references public.books (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  page       integer not null check (page >= 0),
  source     text not null check (source in ('manual', 'photo', 'description')),
  created_at timestamptz not null default now()
);

create index progress_events_book_idx on public.progress_events (book_id, created_at desc);
create index progress_events_user_idx on public.progress_events (user_id, created_at desc);

-- Searchable pieces of a book: either a slice of imported text ('text')
-- or the words read from a photographed page ('scan').
create table public.passages (
  id          bigint generated always as identity primary key,
  book_id     uuid not null references public.books (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('text', 'scan')),
  idx         integer,            -- order within imported text
  page_number integer check (page_number is null or page_number >= 0),  -- printed page, for scans
  start_pct   real check (start_pct is null or (start_pct >= 0 and start_pct <= 1)),
  end_pct     real check (end_pct is null or (end_pct >= 0 and end_pct <= 1)),
  chapter     text check (chapter is null or char_length(chapter) <= 300),
  content     text not null check (char_length(content) between 1 and 20000),
  fts         tsvector generated always as (to_tsvector('english', content)) stored,
  created_at  timestamptz not null default now()
);

create index passages_fts_idx on public.passages using gin (fts);
create index passages_book_idx on public.passages (book_id, kind);

-- Per-user daily counter for AI requests. Only reachable through
-- bump_ai_usage() below, so a user cannot reset their own count.
create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  count   integer not null default 0,
  primary key (user_id, day)
);

-- ---------------------------------------------------- row-level security

alter table public.books enable row level security;
alter table public.progress_events enable row level security;
alter table public.passages enable row level security;
alter table public.ai_usage enable row level security;  -- no policies: no direct access

create policy "books: owner only" on public.books
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "progress: owner only" on public.progress_events
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b where b.id = book_id and b.user_id = (select auth.uid()))
  );

create policy "passages: owner only" on public.passages
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b where b.id = book_id and b.user_id = (select auth.uid()))
  );

grant select, insert, update, delete on public.books to authenticated;
grant select, insert, update, delete on public.progress_events to authenticated;
grant select, insert, update, delete on public.passages to authenticated;
revoke all on public.ai_usage from anon, authenticated;

-- -------------------------------------------------------------- functions

create function public.touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger books_touch before update on public.books
  for each row execute function public.touch_updated_at();

-- Save a new page for a book and keep the book's status in step, in one
-- transaction. Runs as the caller, so row-level security still applies.
create function public.record_progress(p_book uuid, p_page integer, p_source text)
returns public.books
language plpgsql
security invoker
set search_path = ''
as $$
declare
  b public.books;
  new_page integer;
begin
  select * into b from public.books where id = p_book;
  if not found then
    raise exception 'Book not found';
  end if;
  if p_page < 0 then
    raise exception 'Page cannot be negative';
  end if;

  new_page := p_page;
  if b.total_pages is not null and new_page > b.total_pages then
    new_page := b.total_pages;
  end if;

  insert into public.progress_events (book_id, page, source)
  values (p_book, new_page, p_source);

  update public.books set
    current_page = new_page,
    status = case
      when b.total_pages is not null and new_page >= b.total_pages then 'finished'
      when new_page > 0 then 'reading'
      else status
    end,
    finished_at = case
      when b.total_pages is not null and new_page >= b.total_pages then coalesce(finished_at, now())
      else null
    end
  where id = p_book
  returning * into b;

  return b;
end;
$$;

-- Rank a book's passages against a prepared tsquery string such as
-- 'lighthouse | letter | (old <-> keeper)'.
create function public.search_passages(p_book uuid, p_query text, p_limit integer default 20)
returns table (
  id bigint,
  kind text,
  idx integer,
  page_number integer,
  start_pct real,
  end_pct real,
  chapter text,
  content text,
  rank real
)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.kind, p.idx, p.page_number, p.start_pct, p.end_pct, p.chapter, p.content,
         ts_rank(p.fts, q.query, 1) as rank
  from public.passages p,
       (select to_tsquery('english', p_query) as query) q
  where p.book_id = p_book
    and p.fts @@ q.query
  order by rank desc, p.id
  limit least(greatest(p_limit, 1), 50);
$$;

-- Count one AI request for the signed-in user today and return the new total.
create function public.bump_ai_usage()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  n integer;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  insert into public.ai_usage as u (user_id, day, count)
  values (uid, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update set count = u.count + 1
  returning u.count into n;
  return n;
end;
$$;

revoke all on function public.bump_ai_usage() from public, anon;
grant execute on function public.bump_ai_usage() to authenticated;
grant execute on function public.record_progress(uuid, integer, text) to authenticated;
grant execute on function public.search_passages(uuid, text, integer) to authenticated;
