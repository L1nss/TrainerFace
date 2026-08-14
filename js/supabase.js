import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export const SUPABASE_URL =
  "https://unbwdyrhovdxgeggwiwv.supabase.co";

export const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_ZeKAPEARRdrT_iLHBg-ZRQ_UsUdv92F";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);
