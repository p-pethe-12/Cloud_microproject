const env = window.__APP_ENV__ || {};

export const SUPABASE_URL = env.SUPABASE_URL || "https://cvhkqbtflqzvugzadzwv.supabase.co";
export const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2aGtxYnRmbHF6dnVnemFkend2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2OTU5OTEsImV4cCI6MjA5MDI3MTk5MX0.P1iOPZrvbbFUXjh45a1O8nwcaRypy01G8x2fKb3tt4c";

export const APP_NAME = "Nagpur Panchayat Grievance Platform";
export const SESSION_KEY = "panchayat_custom_session";
export const POLL_INTERVAL_MS = 15000;

export const DEPARTMENTS = [
  "Electricity",
  "Water Supply",
  "Roads",
  "Sanitation",
  "Street Lights",
  "Drainage",
  "Garbage Collection",
  "Agriculture",
  "Health",
  "Education",
];

export const PANCHAYAT_NAMES = [
  "Saoner",
  "Ramtek",
  "Katol",
  "Kalmeshwar",
  "Kamptee",
];
