import diagnosticsHandler from './diagnostics.js'

export default async function handler(req, res) {
  const token = String(req.headers['x-diagnostics-token'] || '')

  if (!token) {
    return res.status(404).json({ error: 'Not found' })
  }

  req.query = {
    ...(req.query || {}),
    token,
  }

  return diagnosticsHandler(req, res)
}
