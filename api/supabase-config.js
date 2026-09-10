export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const url = process.env.SUPABASE_URL || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';

  if (!url || !anonKey) {
    return res.status(503).json({
      configured: false,
      error: 'Supabase is not configured yet.'
    });
  }

  return res.status(200).json({
    configured: true,
    url,
    anonKey
  });
}
