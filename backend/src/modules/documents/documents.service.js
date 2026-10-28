/**
 * Shared document handling (résumés, licences, certificates).
 * Files are validated first, written to private storage, and only then recorded
 * in the database; if the database step fails the files are removed again.
 */
const { pool, query } = require('../../config/db');
const storage = require('../../storage');
const { checkFile } = require('../../middleware/upload');
const ApiError = require('../../utils/ApiError');

/** files: [{ file: multerFile, docType }] -> validated list (throws ApiError on a bad file). */
function prepare(files) {
  return files.map(({ file, docType }) => ({ ...checkFile(file), docType }));
}

async function removeKeys(keys) {
  await Promise.all(keys.map((k) => storage.remove(k).catch(() => {})));
}

/** Writes validated files to storage. Cleans up after itself on failure. */
async function persist(prepared) {
  const saved = [];
  try {
    for (const f of prepared) {
      const key = await storage.save(f.buffer, f.ext);
      saved.push({ ...f, key });
    }
    return saved;
  } catch (err) {
    await removeKeys(saved.map((s) => s.key));
    throw err;
  }
}

async function insertAll(db, saved, { applicantId = null, userId = null, uploadedBy = null }) {
  const out = [];
  for (const f of saved) {
    const { rows } = await db.query(
      `INSERT INTO documents (applicant_id, user_id, doc_type, original_name, storage_key, mime_type, size_bytes, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [applicantId, userId, f.docType, f.originalName, f.key, f.mime, f.size, uploadedBy]
    );
    out.push(rows[0]);
  }
  return out;
}

const toDto = (r) => ({
  id: r.id,
  docType: r.doc_type,
  originalName: r.original_name,
  mimeType: r.mime_type,
  sizeBytes: r.size_bytes,
  createdAt: r.created_at,
});

async function listFor({ applicantId, userId }, db = pool) {
  const { rows } = applicantId
    ? await db.query('SELECT * FROM documents WHERE applicant_id = $1 ORDER BY created_at', [applicantId])
    : await db.query('SELECT * FROM documents WHERE user_id = $1 ORDER BY created_at', [userId]);
  return rows.map(toDto);
}

/** Upload one document to an existing applicant or caregiver user (HR/admin action). */
async function addOne({ file, docType, applicantId = null, userId = null, uploadedBy }) {
  const saved = await persist(prepare([{ file, docType }]));
  try {
    const [row] = await insertAll(pool, saved, { applicantId, userId, uploadedBy });
    return toDto(row);
  } catch (err) {
    await removeKeys(saved.map((s) => s.key));
    throw err;
  }
}

/** Fetch a document the caller is allowed to see, scoped to its owner. */
async function getScoped(docId, { applicantId, userId }) {
  const { rows } = await query(
    `SELECT * FROM documents WHERE id = $1 AND ${applicantId ? 'applicant_id' : 'user_id'} = $2`,
    [docId, applicantId || userId]
  );
  if (!rows[0]) throw ApiError.notFound('Document not found');
  return rows[0];
}

/** Stream the stored file as a download. */
function send(res, doc) {
  const stream = storage.open(doc.storage_key);
  stream.on('error', (err) => {
    if (res.headersSent) return res.destroy(err);
    res.status(err.code === 'ENOENT' ? 404 : 500).json({ success: false, message: 'File not available' });
  });
  stream.on('open', () => {
    res.setHeader('Content-Type', doc.mime_type);
    res.setHeader('Content-Length', doc.size_bytes);
    res.setHeader('Content-Disposition', `attachment; filename="${doc.original_name}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    stream.pipe(res);
  });
}

module.exports = { prepare, persist, removeKeys, insertAll, toDto, listFor, addOne, getScoped, send };
