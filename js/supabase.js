const SUPABASE_URL =
    "https://gucxwitkjmwngzorvchb.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_WwWdzuq0brp22FLN_onHBg_XDC5Gukk";

const { createClient } = window.supabase;

const db = createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);