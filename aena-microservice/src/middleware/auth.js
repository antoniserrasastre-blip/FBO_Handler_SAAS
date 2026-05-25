export function bearerAuth(req, res, next) {
  const expected = process.env.AENA_MICROSERVICE_AUTH;
  if (!expected) return next();
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token !== expected) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}
