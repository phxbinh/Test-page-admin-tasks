import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Lấy users từ auth
  const { data: authUsers, error: authError } =
    await supabase.auth.admin.listUsers();

  if (authError) {
    return res.status(500).json({ error: authError.message });
  }

  // Lấy roles từ profiles
  const { data: profiles, error: profileError } =
    await supabase.from('profiles').select('id, role');

  if (profileError) {
    return res.status(500).json({ error: profileError.message });
  }

  const roleMap = Object.fromEntries(
    profiles.map(p => [p.id, p.role])
  );

  // Gộp data
  const users = authUsers.users.map(u => ({
    id: u.id,
    email: u.email,
    role: roleMap[u.id] || 'user'
  }));

  res.status(200).json(users);
}