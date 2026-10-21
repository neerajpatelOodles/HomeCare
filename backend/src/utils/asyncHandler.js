// Express 5 forwards rejected promises automatically; this wrapper keeps the
// intent explicit and works the same on Express 4 if the project is ever downgraded.
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
