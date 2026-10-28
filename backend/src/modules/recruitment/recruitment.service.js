const { withTransaction } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const documents = require('../documents/documents.service');
const notifications = require('../notifications/notifications.service');

/**
 * Public job application. `files` is the multer `fields` result:
 * { resume, cprFirstAid, policeCheck, governmentId, certifications }
 */
async function submitApplication(input, files = {}) {
  if (!files.resume?.[0]) throw ApiError.badRequest('A résumé file is required');

  const list = [
    { file: files.resume[0], docType: 'resume' },
    ...(files.cprFirstAid || []).map((file) => ({ file, docType: 'cpr_first_aid' })),
    ...(files.policeCheck || []).map((file) => ({ file, docType: 'police_check' })),
    ...(files.governmentId || []).map((file) => ({ file, docType: 'government_id' })),
    ...(files.certifications || []).map((file) => ({ file, docType: 'certification' })),
  ];

  // Validate every file BEFORE anything is stored.
  const prepared = documents.prepare(list);
  const saved = await documents.persist(prepared);

  try {
    const applicantId = await withTransaction(async (db) => {
      const { rows } = await db.query(
        `INSERT INTO applicants
           (first_name, last_name, email, phone, profession, license_number, years_experience, city, region, cover_note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [
          input.firstName,
          input.lastName,
          input.email,
          input.phone,
          input.profession,
          input.licenseNumber ?? null,
          input.yearsExperience ?? null,
          input.city ?? null,
          input.region ?? null,
          input.coverNote ?? null,
        ]
      );
      const id = rows[0].id;
      await db.query(
        `INSERT INTO applicant_status_history (applicant_id, from_status, to_status, note)
         VALUES ($1, NULL, 'applied', 'Application submitted')`,
        [id]
      );
      await documents.insertAll(db, saved, { applicantId: id });
      await notifications.queueApplicationReceived(db, id, input);
      return id;
    });
    return { reference: applicantId.slice(0, 8).toUpperCase() };
  } catch (err) {
    await documents.removeKeys(saved.map((s) => s.key));
    if (err.code === '23505') {
      throw ApiError.conflict('You already have an active application for this profession');
    }
    throw err;
  }
}

module.exports = { submitApplication };
