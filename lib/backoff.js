'use strict'

function* backoffGenerator (opts) {
  while (true) {
    opts = computeBackoff(opts)
    if (!opts) {
      throw new Error('max retries reached')
    }
    yield opts.waitFor
  }
}

function computeBackoff (opts) {
  opts ||= {}
  opts.maxRetries ||= Number.MAX_SAFE_INTEGER
  if (!(opts.maxRetries >= 1)) {
    throw new Error('backoff requires maxRetries greater or equal to one')
  }
  const maxRetries = opts.maxRetries
  let retries = opts.retries || 0
  const waitFor = 100 * Math.pow(2, retries)
  if (retries++ >= maxRetries) {
    return false
  }
  return { retries, maxRetries, waitFor }
}

module.exports.backoffGenerator = backoffGenerator
module.exports.computeBackoff = computeBackoff
