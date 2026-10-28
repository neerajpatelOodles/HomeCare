const multer = require('multer');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

// Allowed document types. Each needs a matching file signature ("magic bytes"),
// so renaming virus.exe to resume.pdf does not get through.
const ALLOWED = {
  '.pdf': { mime: 'application/pdf', sig: [Buffer.from('%PDF')] },
  '.jpg': { mime: 'image/jpeg', sig: [Buffer.from([0xff, 0xd8, 0xff])] },
  '.jpeg': { mime: 'image/jpeg', sig: [Buffer.from([0xff, 0xd8, 0xff])] },
  '.png': { mime: 'image/png', sig: [Buffer.from([0x89, 0x50, 0x4e, 0x47])] },
};

const ALLOWED_LABEL = 'PDF, JPG or PNG';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.storage.maxFileMb * 1024 * 1024, files: 8, fields: 30 },
});

const extOf = (name) => {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i).toLowerCase();
};

/** Throws ApiError if the uploaded file is not an allowed type. Returns normalized info. */
function checkFile(file) {
  const ext = extOf(file.originalname || '');
  const rule = ALLOWED[ext];
  if (!rule) throw ApiError.badRequest(`"${file.originalname}": only ${ALLOWED_LABEL} files are allowed`);
  const ok = rule.sig.some((s) => file.buffer.subarray(0, s.length).equals(s));
  if (!ok) throw ApiError.badRequest(`"${file.originalname}" does not look like a valid ${ext.slice(1).toUpperCase()} file`);
  if (file.size === 0) throw ApiError.badRequest(`"${file.originalname}" is empty`);
  return {
    buffer: file.buffer,
    ext: ext === '.jpeg' ? '.jpg' : ext,
    mime: rule.mime,
    size: file.size,
    // Keep a safe display name only (never used as a path).
    originalName: file.originalname.replace(/[^\w.\- ()]/g, '_').slice(0, 200),
  };
}

module.exports = { upload, checkFile, ALLOWED_LABEL };
