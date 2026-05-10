import { Router } from 'express';
import multer from 'multer';
import { parseNetjetsPDF } from '../parsers/netjets.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

router.post('/netjets', upload.single('pdf'), async (req, res) => {
  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ error: 'Missing "pdf" file in multipart/form-data' });
  }
  try {
    const result = await parseNetjetsPDF(req.file.buffer);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'parse_failed', message: err.message });
  }
});

export default router;
