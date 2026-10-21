const ApiError = require('../utils/ApiError');

/** validate({ body: zodSchema, query: zodSchema, params: zodSchema }) */
module.exports = (schemas) => (req, _res, next) => {
  for (const part of ['body', 'query', 'params']) {
    if (!schemas[part]) continue;
    const result = schemas[part].safeParse(req[part]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      }));
      return next(ApiError.badRequest('Validation failed', details));
    }
    // Express 5: req.query is a getter, so store parsed values separately.
    if (part === 'query') req.validatedQuery = result.data;
    else req[part] = result.data;
  }
  next();
};
