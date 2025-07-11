// src/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://lesodnunlecgirkzcabg.supabase.co";
const supabaseAnonKey =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxlc29kbnVubGVjZ2lya3pjYWJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIxMjUxNDgsImV4cCI6MjA2NzcwMTE0OH0.qS0EcQpyiOXq2J2gxnvrEHoHy2SwBQDZtI50Yi-L1XI";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 👇 This exposes it in browser console
if (typeof window !== "undefined") {
    window.supabase = supabase;
}
