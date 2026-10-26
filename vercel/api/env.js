/**
 * Vercel Serverless Function: Environment Provider
 * Reads RENDER_BACKEND_URL, RENDER_EXTERNAL_URL, RAILWAY_BACKEND_URL, GOOGLE_CLIENT_ID, and Cloud integrations
 */
module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Extract distinct platform backend URLs (supports standard and VITE_ prefixed names)
  const renderUrl = (process.env.RENDER_BACKEND_URL || process.env.RENDER_EXTERNAL_URL || process.env.VITE_RENDER_BACKEND_URL || '').trim().replace(/\/+$/, '');
  const railwayUrl = (process.env.RAILWAY_BACKEND_URL || process.env.VITE_RAILWAY_BACKEND_URL || '').trim().replace(/\/+$/, '');
  const herokuUrl = (process.env.HEROKU_BACKEND_URL || process.env.VITE_HEROKU_BACKEND_URL || (process.env.HEROKU_APP_NAME ? `https://${process.env.HEROKU_APP_NAME}.herokuapp.com` : '') || '').trim().replace(/\/+$/, '');
  const genericUrl = (process.env.BACKEND_URL || process.env.VITE_API_BASE_URL || process.env.VITE_BACKEND_URL || '').trim().replace(/\/+$/, '');

  const googleClientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '';
  const cloudinaryConfigured = !!(process.env.CLOUDINARY_URL || process.env.CLOUDINARY_CLOUD_NAME);
  const githubBackupConfigured = !!process.env.GITHUB_TOKEN;

  return res.status(200).json({
    success: true,
    backends: {
      render: renderUrl,
      railway: railwayUrl,
      heroku: herokuUrl,
      custom: genericUrl
    },
    backendUrl: renderUrl || railwayUrl || herokuUrl || genericUrl || '',
    googleClientId: googleClientId.trim(),
    cloudinaryConfigured,
    githubBackupConfigured,
    source: 'vercel_environment_variables'
  });
};
