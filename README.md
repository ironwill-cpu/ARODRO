# ARODRO — Premium Cosmetics E-Commerce

**Live:** https://arodro.onrender.com  
**Admin:** https://arodro.onrender.com/admin  
**Tech:** Express.js + Supabase (PostgreSQL) + Render

## Deploy v1.2 — Resilience + Security
- Graceful homepage fallback if DB is unreachable
- `/health` endpoint for Render uptime monitoring
- Removed hardcoded Supabase fallback credentials
- Safer Render blueprint/env handling

## Health Check
`https://arodro.onrender.com/health`

## Render Environment Variables
Required: `SUPABASE_DB_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `SESSION_SECRET`

## Admin
Default login: `admin` / `Admin@123`
