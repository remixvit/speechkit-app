// pages/api/login.js
export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password } = req.body;
  const sitePassword = process.env.SITE_PASSWORD;

  if (!sitePassword) {
    return res.status(500).json({ error: 'SITE_PASSWORD не задан' });
  }

  if (password !== sitePassword) {
    return res.status(401).json({ error: 'Неверный пароль' });
  }

  // Устанавливаем cookie на 30 дней
  res.setHeader(
    'Set-Cookie',
    `auth=${sitePassword}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${60 * 60 * 24 * 30}`
  );

  return res.status(200).json({ ok: true });
}
