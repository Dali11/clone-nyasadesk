import objectHandler from './_lib/storage/object.js';
import uploadHandler from './_lib/storage/upload.js';

export default async function handler(req, res) {
  const operation = String(req.query?.op || '').toLowerCase();

  if (operation === 'object') {
    return objectHandler(req, res);
  }

  if (operation === 'upload') {
    return uploadHandler(req, res);
  }

  return res.status(404).json({
    error: 'Unknown storage operation',
  });
}
