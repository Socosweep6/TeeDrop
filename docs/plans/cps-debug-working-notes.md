# CPS Debug Working Notes

> Living document. Update after each evidence-producing step.
> Do not record guesses as facts. If something is unconfirmed, label it "hypothesis".

---

## Current Status

**As of 2026-04-08**

- `GetAvailableTimeSheet` has been ruled out — not found in the live frontend bundles
- The correct endpoints are `SearchTeetimes` and/or `GetTeeSheet` (found in bundle)
- Guest short-lived token flow is the preferred auth path — no verified account needed if guest search works
- Bundle mining and guest flow capture are in progress (Tasks 2 and 3)

---

## Confirmed Facts

### Auth

| Fact | Evidence |
|------|----------|
| `POST /identityapi/myconnect/token/short` works with `multipart/form-data`, `client_id=onlinereswebshortlived`, no credentials | Observed in Playwright intercept + confirmed via Node.js |
| JWT from short-lived token has `aud: ["onlinereservation", "references"]` and `scope: ["onlinereservation", "references"]` | Decoded JWT payload |
| `js1` password-grant token also works (`POST /identityapi/connect/token`, `application/x-www-form-urlencoded`) | Direct API call confirmed 200 |
| `x-componentid: 1` is the correct value for the `premiergolf` tenant | Values other than `1` return 403 "Target componentid is not enabled" |

### Working Endpoints

| Endpoint | Method | Auth | Status |
|----------|--------|------|--------|
| `GetAllOptions/premiergolf?version=25.4.2&product=3` | GET | short-lived or js1 token | 200 confirmed |

### Dead Endpoints

| Endpoint | Status | Reason |
|----------|--------|--------|
| `GetAvailableTimeSheet/premiergolf?courseId=N&...` | 404 always | Not in the live frontend bundle — this endpoint does not exist or is retired |

### Config Values (from GetAllOptions response)

| Field | Value |
|-------|-------|
| `siteId` | `1` |
| `terminalId` | `3` |
| `webSiteId` | `fbe1de5b-8700-4db9-d7d2-08da3ce0bbaa` |

### Course IDs (from GetAllOptions → courseOptions[])

| Course | courseId |
|--------|----------|
| West Seattle GC | 2 |
| Jackson Park | 3 |
| Jefferson Park | 4 |
| Bellevue | 5 |
| Interbay | 6 |
| Legion Memorial | 11 |

### Bundle Evidence

| Fact | Evidence |
|------|----------|
| `SearchTeetimes` string present in live frontend | String search of live bundle |
| `GetTeeSheet` string present in live frontend | String search of live bundle |
| `GetAllOptions` string present in live frontend | String search of live bundle |
| `myconnect/token/short` string present in live frontend | String search of live bundle |
| `GetAvailableTimeSheet` string **not present** in live frontend | Absence in string search of live bundle |

### Headers the Frontend Injects (found in bundle)

The Angular app sends more than just `Authorization`. These are present in the bundle:
- `client-id`
- `X-TerminalId`
- `x-requestid`
- `x-websiteid`
- `x-ismobile`
- `x-productid`
- `x-componentid`
- `x-siteid`
- `x-timezone-offset`
- `x-timezoneid`
- `x-moduleid`

---

## Open Questions

1. Is `SearchTeetimes` a GET or POST? What are the required params?
2. Is `GetTeeSheet` a prerequisite step before `SearchTeetimes`, or an alternative?
3. Does the guest short-lived token have sufficient scope to call `SearchTeetimes`?
4. What is the exact URL pattern — does the tenant slug (`premiergolf`) appear in the path, in a header, or in a query param?
5. Are any of the `x-*` headers required for `SearchTeetimes` to return 200, or are they optional metadata?

---

## Raw Captured Requests (fill after Task 2)

_Placeholder — to be filled by `debug-cps-capture-guest-flow.mjs` output_

```
artifact: scripts/cps-artifacts/guest-flow-log.json
```

---

## Bundle Mining Findings (fill after Task 3)

_Placeholder — to be filled by `debug-cps-bundle-mining.mjs` output_

```
artifact: scripts/cps-artifacts/bundle-findings.md
```

---

## Probe Results (fill after Task 4)

_Placeholder — to be filled by `debug-cps-probe-live-search.mjs` output_

```
artifact: scripts/cps-artifacts/probe-results.json
```

---

## Auth Conclusion (fill after Task 5)

_One of:_
- `Guest token is sufficient for tee time search`
- `Verified user session is required for tee time search because ...`
- `Still unknown because ...`

---

## Assumptions That Were Wrong

| Wrong assumption | What's actually true |
|------------------|---------------------|
| `GetAvailableTimeSheet` is the live tee time search endpoint | It is not present in the frontend bundle; the live endpoint is `SearchTeetimes` or `GetTeeSheet` |
| `componentid` is the correct header name | Correct header name is `x-componentid` |
| `js1` OAuth token is sufficient for all API calls | Unknown — short-lived guest token may be required for search |
