const express = require('express');
const validate = require('../../middleware/validate');
const { authorizeRoles, requirePermission } = require('../../middleware/authorize');
const { ROLES } = require('../../utils/constants');
const v = require('./visits.validation');
const controller = require('./visits.controller');

// ---- Admin scheduling: mounted at /api/visits behind authenticate ----------
const admin = express.Router();
const read = requirePermission('visits:read');
const write = requirePermission('visits:write');

admin.get('/options', read, controller.options); // must stay above "/:id"
admin.get('/', read, validate({ query: v.listQuery }), controller.list);
admin.post('/', write, validate({ body: v.createBody }), controller.create);
admin.get('/:id', read, validate({ params: v.idParams }), controller.get);
admin.patch('/:id', write, validate({ params: v.idParams, body: v.updateBody }), controller.update);
admin.post('/:id/cancel', write, validate({ params: v.idParams, body: v.cancelBody }), controller.cancel);
admin.post('/:id/missed', write, validate({ params: v.idParams }), controller.missed);

// ---- Caregiver portal: mounted at /api/caregiver/visits ---------------------
const caregiver = express.Router();
caregiver.use(authorizeRoles(ROLES.CAREGIVER), requirePermission('visits:own'));
caregiver.get('/', validate({ query: v.ownListQuery }), controller.myCaregiverVisits);
caregiver.get('/:id', validate({ params: v.idParams }), controller.myCaregiverVisit);
caregiver.post('/:id/notes', validate({ params: v.idParams, body: v.noteBody }), controller.addNote);
caregiver.post('/:id/complete', validate({ params: v.idParams, body: v.completeBody }), controller.complete);

// ---- Client portal: mounted at /api/client/visits ---------------------------
const client = express.Router();
client.use(authorizeRoles(ROLES.CLIENT), requirePermission('visits:own'));
client.get('/', validate({ query: v.ownListQuery }), controller.myClientVisits);


// Client reads their own active care plan: mounted at /api/client/care-plan.
const carePlan = express.Router();
carePlan.use(authorizeRoles(ROLES.CLIENT), requirePermission('visits:own'));
carePlan.get('/', controller.myCarePlan);

module.exports = { admin, caregiver, client, carePlan };
