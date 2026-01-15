// api/change-role.js
import { createClient } from '@supabase/supabase-js';

/*
export default async function handlerU(req, res) {
      alert("Change role of user")
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { userId, newRole } = req.body;

  if (!userId || !newRole) {
    return res.status(400).json({ error: 'Thiếu userId hoặc newRole' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
*/
/* ----
  const { error } = await supabase
    .from('profiles')
    .update({ role: newRole })
    .eq('id', userId);
----*/
/*
const { data, error } = await supabase
  .from('profiles')
  .update({ role: newRole })
  .eq('id', userId)
  .select('id, role');

console.log('UPDATE RESULT', { data, error });

  if (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ success: true });
}
*/

/*
// api/change-role.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { userId, newRole } = req.body;

  // Mock
  console.log('Mock change role:', userId, '->', newRole);
  return res.status(200).json({ success: true, message: `Mock đổi role thành ${newRole}` });
}
*/





//import { createClient } from '@supabase/supabase-js';
/*
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { userId, newRole } = req.body;

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // ❗ KHÔNG kiểm tra auth.uid() ở đây
  // ❗ API này CHỈ deploy server-side

  const { error } = await supabase
    .from('profiles')
    .update({ role: newRole })
    .eq('id', userId);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true });
}
*/


//import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { userId, newRole } = req.body;

    if (!userId || !newRole) {
      return res.status(400).json({ error: 'Missing params' });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId);

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }

    res.status(200).json({ success: true });
  } catch (e) {
    console.error('Function crash:', e);
    res.status(500).json({ error: e.message });
  }
}




