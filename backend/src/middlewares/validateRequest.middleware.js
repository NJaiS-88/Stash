/**
 * Phase 26 — Strict Request Validation Middleware
 *
 * Validates request bodies against strict Zod schemas.
 * Unexpected fields are rejected with HTTP 400 rather than silently accepted.
 * Attaches validated, sanitized data to req.validatedData.
 */

const validateRequest = (schema) => {
    return (req, res, next) => {
        const result = schema.safeParse(req.body);

        if (!result.success) {
            const issues = result.error.issues.map(issue => ({
                path: issue.path.join('.'),
                message: issue.message,
                code: issue.code,
                received: issue.received
            }));

            console.warn(`[ValidationMiddleware] 🛑 Request rejected (${issues.length} validation issues):`, issues[0]);

            return res.status(400).json({
                error: "Strict Validation Error",
                message: "Payload rejected: contains invalid data types or forbidden unexpected fields.",
                violations: issues
            });
        }

        // Attach parsed, type-safe data to request object
        req.validatedData = result.data;
        next();
    };
};

module.exports = validateRequest;
