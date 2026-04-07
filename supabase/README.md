# Supabase setup

1. Open your Supabase SQL Editor.
2. Run `schema.sql` first.
3. Run `seed.sql` second.
4. Keep using the anon key in `public/js/config.js`.
5. Start the local app with `npm start`.

This project uses custom RPC-based authentication instead of Supabase Auth so it can work with the anon key you shared.
Passwords are stored as bcrypt hashes through Postgres `crypt(..., gen_salt('bf'))`.

Important notes:
- Staff users are pre-seeded for Nagpur district.
- Citizens can register from the UI.
- Complaint flow is citizen -> panchayat admin -> same panchayat department -> district officer visibility.
- Department routing is locked to the correct panchayat department in the database layer.
- If you want realtime subscriptions later, add `complaints` and `complaint_status_history` to the `supabase_realtime` publication and swap the polling service with a Realtime listener.
