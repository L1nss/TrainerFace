import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://gucxwitkjmwngzorvchb.supabase.co";

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1Y3h3aXRram13bmd6b3J2Y2hiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1NTY0OTksImV4cCI6MjEwMjEzMjQ5OX0.J1vKsxqwsvlxZEyfgQdTz1DMYEfl-3CYMN18SE3TtPc";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
