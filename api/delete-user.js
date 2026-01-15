// api/delete-user.js
import { createClient } from '@supabase/supabase-js';


export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'Thiếu userId' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
/*
  const { error } = await supabase.auth.admin.deleteUser(userId);
*/

try {
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) {
    console.error('Supabase deleteUser error:', error);
    return res.status(500).json({ error: error.message });
  }
  return res.status(200).json({ success: true });
} catch(e) {
  console.error('Exception:', e);
  return res.status(500).json({ error: e.message });
}

/*
  if (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
*/

  return res.status(200).json({ success: true });
}

/*
// api/delete-user.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { userId } = req.body;

  // Mock response (khi chưa kết nối Supabase thật)
  console.log('Mock delete user:', userId);
  return res.status(200).json({ success: true, message: `Mock xóa user ${userId}` });
}
*/




