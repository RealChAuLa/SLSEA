const knownErrorTypes = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'URIError',
  'EvalError',
]);

export function createLogger(sink = console) {
  return {
    info(entry) {
      sink.info(
        JSON.stringify({
          event: entry.event,
          request_id: entry.request_id,
          method: entry.method,
          path: entry.path,
          status: entry.status,
          duration_ms: entry.duration_ms,
        }),
      );
    },
    error({ event, request_id, error }) {
      // Keep the fault type and source locations, but omit the message and source
      // snippets: dependencies may embed credentials or submitted input in them.
      const frames = String(error.stack ?? '')
        .split('\n')
        .filter((line) => /^\s+at .+:\d+:\d+\)?$/.test(line))
        .map((line) => line.trim());
      sink.error(
        JSON.stringify({
          event,
          request_id,
          error_type: knownErrorTypes.has(error.name) ? error.name : 'Error',
          frames,
        }),
      );
    },
  };
}

export const logger = createLogger();
