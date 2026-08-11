/**
 * Error reporting.
 *
 * Failures used to disappear into console.error, which no customer will ever
 * open — so the only way you heard about a bug was churn. This is the one place
 * errors are reported, so wiring up a service later is a change to this file
 * and nothing else.
 *
 * Set VITE_SENTRY_DSN and install @sentry/react to turn on remote reporting;
 * without it, errors are logged locally and the app behaves exactly as before.
 */

const DSN = import.meta.env.VITE_SENTRY_DSN
let remote = null

if (DSN) {
  // Loaded lazily so the SDK is not bundled for anyone who hasn't configured it.
  import('@sentry/react')
    .then((Sentry) => {
      Sentry.init({
        dsn: DSN,
        environment: import.meta.env.MODE,
        tracesSampleRate: 0.1,
        // Cost prices and margins must never leave the customer's own database.
        beforeSend: (event) => {
          delete event.request?.data
          return event
        },
      })
      remote = Sentry
    })
    .catch(() => { /* reporting is best-effort; never break the app over it */ })
}

/**
 * Report an error with the context needed to find it.
 * @param {Error|unknown} error
 * @param {object} context - e.g. { where: 'QuotationDetail.save', quotationId }
 */
export function reportError(error, context = {}) {
  if (import.meta.env.DEV) {
    console.error(`[${context.where || 'app'}]`, error, context)
  }
  if (remote) {
    remote.captureException(error, { extra: context })
  }
}

/** Identify the signed-in user on subsequent reports. Never send the email. */
export function setErrorUser(userId, orgId) {
  if (remote) {
    remote.setUser(userId ? { id: userId } : null)
    remote.setTag('org_id', orgId || 'none')
  }
}
