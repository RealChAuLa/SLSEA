export function expectApiError(res, status, code) {
  expect(res.status).toBe(status);
  expect(res.headers['content-type']).toMatch(/^application\/json/);
  expect(Object.keys(res.body)).toEqual(['error']);
  expect(Object.keys(res.body.error).sort()).toEqual([
    'code',
    'details',
    'message',
    'request_id',
    'status',
  ]);
  expect(res.body.error).toEqual({
    code,
    status,
    message: expect.any(String),
    details: expect.any(Array),
    request_id: res.headers['x-request-id'],
  });
  expect(res.body.error.message.length).toBeGreaterThan(0);
  expect(res.headers['x-request-id']).toMatch(
    /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i,
  );
  for (const detail of res.body.error.details) {
    expect(detail).toEqual({
      field: expect.any(String),
      issue: expect.any(String),
    });
  }
}
