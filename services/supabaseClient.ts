import { createClient } from '@supabase/supabase-js';

// Project URL from your connection string hostname (db.ictppqhcfmnnbtamrivf.supabase.co)
const SUPABASE_URL = 'https://ictppqhcfmnnbtamrivf.supabase.co';

// ⚠️ IMPORTANT: YOU MUST REPLACE THIS WITH YOUR SUPABASE "ANON" PUBLIC KEY
// Go to Supabase Dashboard -> Project Settings -> API -> Project API keys -> anon public
const SUPABASE_KEY: string = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljdHBwcWhjZm1ubmJ0YW1yaXZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0OTU1MjcsImV4cCI6MjA4NTA3MTUyN30.18Fl0ECYloAnzPCNnNBmva2EHqePmWgwnGHnYEN9q_o'; 

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Helper to check if key is missing
export const isSupabaseConfigured = () => {
  return SUPABASE_KEY !== '';
};