# SLSEA API: Postman and cURL reference

All seven seeded users initially use **Solar#Demo2026**. If you change/reset a password, use its new value until you restore it.

| ID  | Email                      | Jurisdiction |
| --- | -------------------------- | ------------ |
| 1   | national.operator@slsea.lk | national     |
| 2   | national.analyst@slsea.lk  | national     |
| 3   | western.province@slsea.lk  | provincial 1 |
| 4   | central.province@slsea.lk  | provincial 2 |
| 5   | colombo.district@slsea.lk  | district 1   |
| 6   | gampaha.district@slsea.lk  | district 2   |
| 7   | kandy.district@slsea.lk    | district 4   |

## Import and preparation

The companion file [slsea.postman_collection.json](slsea.postman_collection.json) imports all **33 operations across 30 paths**. In Postman choose **Import** and select it. For individual cURL examples, choose **Import** and paste one complete command. See [Postman import documentation](https://learning.postman.com/docs/getting-started/importing-and-exporting/importing-data/).

These cURL examples use Postman variables; they are intended for importing into Postman. For terminal use, replace every double-brace placeholder with a real value. Backslash line continuations are shell syntax; do not paste them unchanged into PowerShell.

Collection variables:

| Variable                 | Value or action                                                                                                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| baseUrl                  | https://slsea.vercel.app                                                                                                                           |
| email                    | national.operator@slsea.lk; use this national login to access all example IDs                                                                      |
| password                 | Solar#Demo2026                                                                                                                                     |
| userToken                | Send Login first. The collection saves access_token automatically. With individually imported cURL, copy access_token into this variable manually. |
| deviceToken              | Privately copy the token for site_id 1 from seed-output/device-tokens.json. It is not a user token.                                                |
| from                     | 2026-10-08T18:30:00Z; replace with a start inside your seeded history when needed                                                                  |
| to                       | 2026-10-09T18:30:00Z; greater than from                                                                                                            |
| existingReadingTimestamp | Send Latest reading for installation 1 first; the collection saves its timestamp. For cURL-only imports, copy that timestamp manually.             |
| newReadingTimestamp      | A new UTC timestamp, after the latest reading and no more than five minutes ahead; the collection prepares it from Latest reading.                 |
| nextCounter              | At least the preceding cumulative_energy_Kwh; the collection prepares latest counter + 0.01. Use a numeric value, without quotes.                  |
| newPassword              | Brighter#Sun2027                                                                                                                                   |

Use collection variables from the imported collection, or create matching environment variables for individually imported cURL requests. Clear conflicting environment values if they override collection values.

Run Login, then read requests. GET returns 200, except an unknown/empty last-known reading returns 404. Send Latest reading before One existing reading or device POST. Trend dates outside the available history produce zero-filled buckets; old data can appear stale in current summaries.

POST ingestion creates a real reading and returns 201; repeating its timestamp returns 409. PATCH changes real passwords and returns an empty 204, revoking the affected user's tokens. Run the password examples last, one at a time. Restore passwords using the instructions below.

## Every documented operation

### 1. Health: GET /health

```bash
curl --request GET --url 'https://slsea.vercel.app/health' \
  --header 'Accept: application/json'
```

### 2. Swagger UI: GET /docs

```bash
curl --request GET --url 'https://slsea.vercel.app/docs' \
  --header 'Accept: text/html'
```

### 3. OpenAPI specification: GET /openapi.json

```bash
curl --request GET --url 'https://slsea.vercel.app/openapi.json' \
  --header 'Accept: application/json'
```

### 4. Login: POST /v1/auth/tokens

```bash
curl --request POST --url 'https://slsea.vercel.app/v1/auth/tokens' \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "email": "{{email}}",
  "password": "{{password}}"
}'
```

### 5. Own profile: GET /v1/users/me

```bash
curl --request GET --url 'https://slsea.vercel.app/v1/users/me' \
  --header 'Accept: application/json' \
  --header 'Authorization: Bearer {{userToken}}'
```

### 6. Users you may manage: GET /v1/users

```bash
curl --request GET --url 'https://slsea.vercel.app/v1/users?page=1&page_size=50&sort=name' \
  --header 'Accept: application/json' \
  --header 'Authorization: Bearer {{userToken}}'
```

### 7. Profile of user 3: GET /v1/users/{userId}

```bash
curl --request GET --url 'https://slsea.vercel.app/v1/users/3' \
  --header 'Accept: application/json' \
  --header 'Authorization: Bearer {{userToken}}'
```

### 8. Provinces: GET /v1/provinces

```bash
curl --request GET --url 'https://slsea.vercel.app/v1/provinces?page=1&page_size=50&sort=name' \
  --header 'Accept: application/json' \
  --header 'Authorization: Bearer {{userToken}}'
```

### 9. Province 1: GET /v1/provinces/{provinceId}

```bash
curl --request GET --url 'https://slsea.vercel.app/v1/provinces/1' \
  --header 'Accept: application/json' \
  --header 'Authorization: Bearer {{userToken}}'
```

### 10. Districts in province 1: GET /v1/provinces/{provinceId}/districts

```bash
curl --request GET --url 'https://slsea.vercel.app/v1/provinces/1/districts?page=1&page_size=50&sort=name' \
  --header 'Accept: application/json' \
  --header 'Authorization: Bearer {{userToken}}'
```

### 11. District 1: GET /v1/districts/{districtId}

```bash
curl --request GET --url 'https://slsea.vercel.app/v1/districts/1' \
  --header 'Accept: application/json' \
  --header 'Authorization: Bearer {{userToken}}'
```

### 12. Substations in district 1: GET /v1/districts/{districtId}/grid-substations

```bash
curl --request GET --url 'https://slsea.vercel.app/v1/districts/1/grid-substations?page=1&page_size=50&sort=name' \
  --header 'Accept: application/json' \
  --header 'Authorization: Bearer {{userToken}}'
```

### 13. Substation 1: GET /v1/grid-substations/{substationId}

```bash
curl --request GET --url 'https://slsea.vercel.app/v1/grid-substations/1' \
  --header 'Accept: application/json' \
  --header 'Authorization: Bearer {{userToken}}'
```

### 14. Installations in substation 1: GET /v1/grid-substations/{substationId}/installations

```bash
curl --request GET --url 'https://slsea.vercel.app/v1/grid-substations/1/installations?page=1&page_size=50&sort=name&include=last_known_reading' \
  --header 'Accept: application/json' \
  --header 'Authorization: Bearer {{userToken}}'
```

### 15. Installations: GET /v1/installations

```bash
curl --request GET --url 'https://slsea.vercel.app/v1/installations?province_id=1&district_id=1&substation_id=1&page=1&page_size=50&sort=name&include=last_known_reading' \
  --header 'Accept: application/json' \
  --header 'Authorization: Bearer {{userToken}}'
```

### 16. Installation 1: GET /v1/installations/{siteId}

```bash
curl --request GET --url 'https://slsea.vercel.app/v1/installations/1' \
  --header 'Accept: application/json' \
  --header 'Authorization: Bearer {{userToken}}'
```

### 17. Latest reading for installation 1: GET /v1/installations/{siteId}/last-known-reading

```bash
curl --request GET --url 'https://slsea.vercel.app/v1/installations/1/last-known-reading' \
  --header 'Accept: application/json' \
  --header 'Authorization: Bearer {{userToken}}'
```

### 18. Overview of installation 1: GET /v1/installations/{siteId}/overview

```bash
curl --request GET --url 'https://slsea.vercel.app/v1/installations/1/overview' \
  --header 'Accept: application/json' \
  --header 'Authorization: Bearer {{userToken}}'
```

### 19. History for installation 1: GET /v1/installations/{siteId}/readings

```bash
curl --request GET --url 'https://slsea.vercel.app/v1/installations/1/readings?page=1&page_size=50&sort=-timestamp' \
  --header 'Accept: application/json' \
  --header 'Authorization: Bearer {{userToken}}'
```

### 20. One existing reading: GET /v1/installations/{siteId}/readings/{timestamp}

```bash
curl --request GET --url 'https://slsea.vercel.app/v1/installations/1/readings/{{existingReadingTimestamp}}' \
  --header 'Accept: application/json' \
  --header 'Authorization: Bearer {{userToken}}'
```

### 21. History across installations: GET /v1/readings

```bash
curl --request GET --url 'https://slsea.vercel.app/v1/readings?from={{from}}&to={{to}}&province_id=1&district_id=1&substation_id=1&site_id=1&page=1&page_size=50&sort=-timestamp' \
  --header 'Accept: application/json' \
  --header 'Authorization: Bearer {{userToken}}'
```

### 22. Summary for the caller jurisdiction: GET /v1/generation-summary

```bash
curl --request GET --url 'https://slsea.vercel.app/v1/generation-summary' \
  --header 'Accept: application/json' \
  --header 'Authorization: Bearer {{userToken}}'
```

### 23. Summary for province 1: GET /v1/provinces/{provinceId}/generation-summary

```bash
curl --request GET --url 'https://slsea.vercel.app/v1/provinces/1/generation-summary' \
  --header 'Accept: application/json' \
  --header 'Authorization: Bearer {{userToken}}'
```

### 24. Summary for district 1: GET /v1/districts/{districtId}/generation-summary

```bash
curl --request GET --url 'https://slsea.vercel.app/v1/districts/1/generation-summary' \
  --header 'Accept: application/json' \
  --header 'Authorization: Bearer {{userToken}}'
```

### 25. Summary for substation 1: GET /v1/grid-substations/{substationId}/generation-summary

```bash
curl --request GET --url 'https://slsea.vercel.app/v1/grid-substations/1/generation-summary' \
  --header 'Accept: application/json' \
  --header 'Authorization: Bearer {{userToken}}'
```

### 26. Trend for the caller jurisdiction: GET /v1/generation-trend

```bash
curl --request GET --url 'https://slsea.vercel.app/v1/generation-trend?from={{from}}&to={{to}}&interval=day&page=1&page_size=50&sort=bucket_start' \
  --header 'Accept: application/json' \
  --header 'Authorization: Bearer {{userToken}}'
```

### 27. Trend for province 1: GET /v1/provinces/{provinceId}/generation-trend

```bash
curl --request GET --url 'https://slsea.vercel.app/v1/provinces/1/generation-trend?from={{from}}&to={{to}}&interval=day&page=1&page_size=50&sort=bucket_start' \
  --header 'Accept: application/json' \
  --header 'Authorization: Bearer {{userToken}}'
```

### 28. Trend for district 1: GET /v1/districts/{districtId}/generation-trend

```bash
curl --request GET --url 'https://slsea.vercel.app/v1/districts/1/generation-trend?from={{from}}&to={{to}}&interval=day&page=1&page_size=50&sort=bucket_start' \
  --header 'Accept: application/json' \
  --header 'Authorization: Bearer {{userToken}}'
```

### 29. Trend for substation 1: GET /v1/grid-substations/{substationId}/generation-trend

```bash
curl --request GET --url 'https://slsea.vercel.app/v1/grid-substations/1/generation-trend?from={{from}}&to={{to}}&interval=day&page=1&page_size=50&sort=bucket_start' \
  --header 'Accept: application/json' \
  --header 'Authorization: Bearer {{userToken}}'
```

### 30. Trend for installation 1: GET /v1/installations/{siteId}/generation-trend

```bash
curl --request GET --url 'https://slsea.vercel.app/v1/installations/1/generation-trend?from={{from}}&to={{to}}&interval=day&page=1&page_size=50&sort=bucket_start' \
  --header 'Accept: application/json' \
  --header 'Authorization: Bearer {{userToken}}'
```

### 31. Create a reading for installation 1: POST /v1/installations/{siteId}/readings

Creates a real reading. First send Latest reading for installation 1; then set the private site-1 deviceToken. Repeated timestamp returns 409. Refresh Latest reading before another POST.

```bash
curl --request POST --url 'https://slsea.vercel.app/v1/installations/1/readings' \
  --header 'Accept: application/json' \
  --header 'Authorization: Bearer {{deviceToken}}' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "timestamp": "{{newReadingTimestamp}}",
  "power_Kw": 1,
  "cumulative_energy_Kwh": {{nextCounter}},
  "voltage": 230
}'
```

### 32. Reset user 3 password: PATCH /v1/users/{userId}

National login resets Western Province Officer (user 3). To restore the demo password, send this request again with new_password equal to Solar#Demo2026. This revokes that user’s old tokens.

```bash
curl --request PATCH --url 'https://slsea.vercel.app/v1/users/3' \
  --header 'Accept: application/json' \
  --header 'Authorization: Bearer {{userToken}}' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "new_password": "{{newPassword}}"
}'
```

### 33. Change your own password: PATCH /v1/users/me

Changes the logged-in user password and revokes userToken. Log in again with the changed password. Recovery instructions are in docs/postman-curl.md.

```bash
curl --request PATCH --url 'https://slsea.vercel.app/v1/users/me' \
  --header 'Accept: application/json' \
  --header 'Authorization: Bearer {{userToken}}' \
  --header 'Content-Type: application/json' \
  --data-raw '{
  "current_password": "{{password}}",
  "new_password": "{{newPassword}}"
}'
```

## Restore demo passwords after PATCH

For the user-3 reset, keep your National Operator token and repeat PATCH /v1/users/3 with:

```json
{ "new_password": "Solar#Demo2026" }
```

After changing your own password, log in again with email national.operator@slsea.lk and password Brighter#Sun2027 (or the new value you selected). Copy the fresh access_token into userToken. Repeat PATCH /v1/users/me with:

```json
{ "current_password": "Brighter#Sun2027", "new_password": "Solar#Demo2026" }
```

That restore revokes the fresh token again. Set password back to Solar#Demo2026 and log in once more before further protected requests. If you change collection variables, ensure newPassword differs from password for self-change.

## Optional negative and conditional checks

- Send PUT to /health: 405 with Allow: GET.
- Send a protected GET without a user token: 401.
- Send a protected GET with a device token: 403.
- Repeat the same device POST: 409, with no second insertion.
- Copy an ETag from a history response into If-None-Match on the same request: 304 with an empty body.
- Use a district user and request another district: 403.

Prepared from OpenAPI 1.0.0. All 33 method/path pairs were checked against the local specification; these examples were not executed against production during preparation.
