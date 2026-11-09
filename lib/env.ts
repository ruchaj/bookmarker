// Supabase connection settings. The publishable key is safe to ship to the
// browser: row-level security decides what each signed-in user can touch.
// (Older Supabase projects call this the "anon" key; either works.)

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);
