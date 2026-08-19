# Placement Interview Defense Guide — Career Connect

This document maps **every** question in §19 of the project plan ("Possible Interview
Discussion Areas") to the file and function in this repository that answers it.

Paths are repo-relative — open them from the repository root.

> **How to use this:** read the answer, then open the file and read the code around
> the named function. The goal is that nothing here is a memorised script — every
> answer below is a thing the code actually does, and you can point at it.

---

## 1. Architecture

### Q: Why a modular monolith instead of microservices at this stage?
* **Answer:** At this scale — two ingestion sources, single-digit requests/sec, one
  developer — microservices buy nothing and cost a lot: network hops between
  services, partial-failure handling, separate deployments and logs. The codebase
  still gets the *benefit* people want from microservices (clear module
  boundaries) by separating `services/ingestion`, `services/normalization`,
  `services/dedup`, `services/analytics`, and `services/skillGap` as independent
  modules with no cross-imports between them, behind a thin controller layer. If
  one module later needed independent scaling, it could be lifted out without
  untangling it first.
* **Code:** `backend/app.js` (route composition), `backend/src/services/` (module split)

### Q: How does a request travel through the system, end to end?
* **Answer:** Take `GET /api/jobs?search=backend&skill=react&page=1`:
  1. `app.js` — helmet → CORS → JSON body parsing → morgan logging
  2. `src/routes/jobs.js` — matches the route (public, no auth middleware)
  3. `src/controllers/jobController.js` → `getJobs()` — parses and clamps
     pagination, escapes regex input, resolves the `skill` name to a `Skill._id`,
     resolves that to matching `jobId`s via the `JobSkill` join, and builds one
     match stage
  4. MongoDB — the page and the count run in parallel against the same filter
  5. Response — `{ jobs, total, page, pages }`
  6. Any thrown error skips the rest and lands in `errorHandler` for formatting
* **Code:** `backend/app.js` → `backend/src/routes/jobs.js` → `backend/src/controllers/jobController.js:getJobs`

### Q: Why cron-based scheduling instead of a message queue — and what would change that?
* **Answer:** A queue (BullMQ + Redis) earns its keep when you need retry with
  backoff, dead-letter handling, and concurrency control across many jobs. With
  two sources on a six-hour cadence, a failed run simply retries at the next tick,
  and per-source error isolation already prevents one bad source from taking down
  the run. What would change the answer: many more sources, per-source rate limits
  that need pacing, or ingestion becoming user-triggered and latency-sensitive.
* **Code:** `backend/src/services/ingestion/ingestionRunner.js` (header comment)

---

## 2. Data Ingestion

### Q: What happens if one external source is down or rate-limited?
* **Answer:** Each fetcher catches its own network/HTTP errors and returns
  `{ records: [], errors: [...] }` rather than throwing — so a failure is *data*,
  not control flow. `runIngestion` loops over the sources and wraps each in its own
  try/catch, then writes one `IngestionLog` document per source. If Adzuna is down,
  RemoteOK still ingests, and the admin panel shows one failed row and one
  successful row for that run. Requests use a 10-second timeout so a hanging source
  cannot stall the run indefinitely.
* **Code:** `backend/src/services/ingestion/adzuna.js`, `remoteok.js`, `ingestionRunner.js:runIngestion`

### Q: How do you handle a source changing its response schema?
* **Answer:** Every record is validated for its minimum required fields before
  mapping (`if (!item.title || !item.company?.display_name) → skip and log`).
  A schema change therefore degrades to "records skipped, reason recorded in the
  ingestion log" rather than writing malformed documents into the database. The
  per-record try/catch means one unmappable record cannot abort the batch. This is
  the "never trust data from an external source without validating its shape before
  storage" principle from §9 of the plan.
* **Code:** `backend/src/services/ingestion/adzuna.js`, `remoteok.js` (mapping loops)

### Q: Why 2 APIs plus scraping, instead of just more APIs?
* **Answer:** Because most individual companies don't have an API at all — Adzuna
  and RemoteOK are third-party aggregators, not the companies themselves. To pull
  postings from an individual company with no API, scraping is the only option.
  Two APIs give stable, structured, legal data; scraping extends coverage to
  companies no API reaches, and exercises a genuinely different skill (parsing
  uncontrolled HTML, handling template drift) than "call a documented endpoint."
* **Code:** `backend/src/services/ingestion/greenhouse.js`, `lever.js`

### Q: Isn't scraping 150+ individual company career pages unbuildable for one person? How do you cover many companies without writing many scrapers?
* **Answer:** By not scraping companies individually at all. Most companies don't
  hand-build their careers page — they use a shared Applicant Tracking System.
  Every company on Greenhouse renders the *same* board template at
  `boards.greenhouse.io/{slug}`; only the slug and the underlying job data differ.
  So this is **one parser per platform, parameterized by company slug** — adding
  coverage means adding a verified slug to `config/scrapeTargets.js`, not writing
  new parsing code. The same logic applies to Lever. This is the mechanism that
  makes "aggregated from N companies" a real, scaling claim rather than N
  individually fragile scrapers.
* **Code:** `backend/src/config/scrapeTargets.js`, `backend/src/services/ingestion/greenhouse.js`

### Q: How did you decide which companies to include? Walk me through the verification.
* **Answer:** Every slug in `scrapeTargets.js` was verified twice, and the two
  checks disagreed for a meaningful fraction of companies — worth stating
  proactively, because it's the most interesting real finding from building this.
  First check: does the company use this ATS at all (its own unofficial JSON board
  endpoint, e.g. `boards-api.greenhouse.io/v1/boards/{slug}/jobs`, used only to
  confirm existence — never for ingestion, since that would bypass the scraping
  entirely). Second check: does the *actual scraper* (`parseGreenhouseBoard`) return
  real records against the live HTML page. 16 of the first 22 companies that passed
  check one failed check two — they redirect their public board to a fully custom
  careers page on their own domain (`stripe.com/careers/search`,
  `careers.airbnb.com`) instead of rendering the shared Greenhouse template, so the
  scraper's selectors find nothing there. Only slugs passing both checks are in the
  final list: 28 Greenhouse + 9 Lever = 37 companies.
* **Code:** `backend/src/config/scrapeTargets.js` (header comment); `DESIGN.md` correction #12

### Q: What happens when a company's HTML layout changes?
* **Answer:** Same per-company isolation principle as per-source isolation
  elsewhere in the pipeline, one level deeper: each company is fetched and parsed
  inside its own try/catch inside the loop in `fetchFromGreenhouse`/`fetchFromLever`.
  A failure for one company — a changed selector returning nothing, a timeout, an
  HTTP error — is caught, logged with the specific slug, and the loop continues to
  the next company. It never aborts the batch. A parsing failure specifically
  (selectors matching zero rows) is logged explicitly rather than silently
  succeeding with zero records, so it's distinguishable from "this company simply
  has no open roles right now."
* **Code:** `backend/src/services/ingestion/greenhouse.js:fetchFromGreenhouse`

### Q: Why does the scraped `description` field come back empty?
* **Answer:** A deliberate scope decision, not an oversight. The board *listing*
  page gives title, location, and a link for every open role in one request per
  company. The full description lives on each job's own detail page — fetching
  those individually would multiply request volume by the total number of open
  roles across 37 companies, hundreds of extra requests for a portfolio-scale run.
  Scraped jobs are ingested with `description: ''`; skill extraction naturally
  finds fewer matches on them than on the API sources. The honest framing: this is
  a real scraping-at-scale trade-off (breadth vs. per-listing depth), and the
  documented v2 fix is a rate-limited, capped per-job description fetch.
* **Code:** `backend/src/services/ingestion/greenhouse.js` (file header); `DESIGN.md` §7 v2 direction #5

* **Reference:** `DESIGN.md` §1 "Ingestion breadth", §4; project plan §22

---

## 3. Deduplication

### Q: Walk me through your exact-match dedup logic — what does it hash on, and why?
* **Answer:** SHA-256 over `normalize(title) | normalize(company) | normalize(location)`.
  Title alone is not unique (one company posts "Software Engineer" in several
  cities); company alone is obviously not. That triple is the smallest combination
  that identifies a posting with high confidence. `normalizeForHash` lowercases,
  strips punctuation, and collapses whitespace, so formatting differences between
  sources do not produce different hashes. `postedDate` is deliberately excluded —
  sources disagree on it by a day or two for the same posting, and including it
  would break the merge. A unique index on `dedupeHash` enforces this at the
  database level, not just in application code.
* **Code:** `backend/src/services/dedup/dedup.js:computeDedupeHash`, `backend/src/models/Job.js` (unique index)
* **Tests:** `backend/tests/dedup.test.js`

### Q: What happens when two sources disagree on job details after a merge?
* **Answer:** First-write-wins on the job fields, and the second source is recorded
  in the embedded `sources[]` array (via `$addToSet`) rather than discarded. So the
  lineage is preserved — you can always see that this record was seen on both
  Adzuna and RemoteOK, with each source's URL and fetch time. Skills are not
  re-extracted on merge, since they were linked when the record was first inserted.
  **Honest limitation to state proactively:** if the second source's description
  lists skills the first did not, those skills are currently missed. The fix would
  be to union the extracted skill sets on merge — a small, well-understood change.
* **Code:** `backend/src/services/ingestion/ingestionRunner.js:processRecord` (dedup branch)

### Q: Where does exact-match dedup fall short, and how would fuzzy matching close that gap?
* **Answer:** It fails whenever the normalized triple differs by even one
  character. The clearest real case is location: "Bangalore" vs
  "Bangalore (Remote-friendly)" are the same posting but hash differently — this is
  pinned as an explicit test so the boundary is known, not discovered live. Fuzzy
  matching would replace exact equality with a similarity threshold (Jaccard over
  title tokens, or Levenshtein distance) and treat a pair above the threshold as a
  duplicate. The cost is that it needs candidate blocking to avoid O(n²)
  comparisons, plus a tuned threshold — which is precisely why it is scoped as v2.
* **Code / test:** `backend/tests/dedup.test.js` ("dedup boundary: a differing location string does NOT merge")

### Q: Why does title normalization have a special case for internships?
* **Answer:** Alias matching is substring-based, so "Frontend Engineer Intern"
  matches the shorter `'frontend engineer'` entry and would normalize to
  "Frontend Engineer" — dropping the word that distinguishes the two. That is a
  *false merge*: an internship and a full-time role at the same company and
  location would collapse into one record. On a platform for students choosing what
  to apply to, that is the most damaging error the pipeline could make, so the
  intern marker is re-attached as a rule after alias resolution.
* **Code:** `backend/src/services/normalization/titleNorm.js:normalizeTitle`
* **Tests:** `backend/tests/titleNorm.test.js`

---

## 4. Database

### Q: Why MongoDB? Why not PostgreSQL, given the relational-looking joins?
* **Answer:** State the trade-off before it is pointed out: Job↔Skill↔User is
  genuinely many-to-many, which is the natural shape for a relational database, and
  PostgreSQL would give real join support and referential integrity. MongoDB was
  chosen deliberately, for a portfolio reason (this is the one conventional MERN
  project among five) and handled honestly — join tables (`JobSkill`, `UserSkill`)
  with referenced ObjectIds and `$lookup` in aggregation, rather than pretending the
  relationships away by embedding. The point being demonstrated is MongoDB used
  *with judgment*, not "MongoDB because it is schemaless."
* **Code:** `backend/src/models/JobSkill.js`, `UserSkill.js` (header comments)

### Q: Why reference here but embed there — walk through one example.
* **Answer:** The rule: **reference** when the related entity has its own identity
  and independent query needs; **embed** only for small, bounded data with no
  lifecycle of its own.
  * `Job.company` is a **reference** — companies are queried on their own (the
    postings-by-company analytic), are shared across many jobs, and can be renamed;
    embedding would mean updating the name in N job documents.
  * `Job.sources[]` is **embedded** — three fields, realistically 2-5 entries, never
    queried apart from the job, and meaningless without it.
* **Code:** `backend/src/models/Job.js` (header comment), `backend/src/models/Company.js`

### Q: Which fields are indexed, and why those specifically?
* **Answer:** Each index maps to a query the app actually runs:
  * `jobs: { title: 'text', description: 'text' }` — the `?search=` full-text query and the skill-gap engine's target-role search
  * `jobs.company`, `jobs.location` — the company and location filters
  * `jobs.postedDate` (descending) — the default "most recent first" sort and every date-window `$match`
  * `jobs.dedupeHash` (unique) — the per-record dedup lookup on ingestion; unique so the database enforces it
  * `jobSkills.jobId` — "what skills does this job need?" (job detail page)
  * `jobSkills.skillId` — "which jobs need this skill?" (skill filter, trends)
  * `jobSkills: { jobId, skillId }` (compound unique) — prevents duplicate links on re-ingestion
  * `userSkills: { userId, skillId }` (compound unique) — one row per user/skill pair
  * `ingestionLogs.runAt` (descending) — the admin panel's default sort
* **Code:** the `.index(...)` calls at the bottom of each file in `backend/src/models/`

---

## 5. Analytics

### Q: Why compute trends via aggregation pipeline instead of in application code?
* **Answer:** The alternative is fetching every `JobSkill` document into Node and
  counting them with `reduce`. That ships the entire collection over the network to
  compute a ten-row answer, holds it all in the API process's memory, and gets
  linearly worse as the data grows. The pipeline does the grouping inside MongoDB,
  next to the data and using its indexes, and returns only the finished result. The
  clearest example is skill co-occurrence: pairing skills in JavaScript is a nested
  loop over every job, whereas the pipeline unwinds each job's skill set against
  itself and uses `{ $lt: [a, b] }` to keep one canonical ordering per pair.
* **Code:** `backend/src/services/analytics/trends.js` — `getTopSkills`, `getSkillCooccurrence`

### Q: How would this query perform at 1M+ documents?
* **Answer:** `getTopSkills` starts with a `$lookup` from `JobSkill` into `jobs` and
  filters on date afterwards, so at a million documents it joins more rows than it
  ultimately keeps. The honest answer is that it is correct but not optimal at that
  scale, and the fix is known: denormalise `postedDate` onto the `JobSkill`
  documents so the date `$match` runs first against an index and the lookup only
  touches surviving rows. Beyond that: an index on `{ postedDate, skillId }`, then
  a nightly pre-aggregated `skillTrends` rollup collection, since trend data does
  not need to be real-time. Caching would come after that, not before — no repeated
  query load exists yet to justify it.
* **Code:** `backend/src/services/analytics/trends.js`

---

## 6. Authentication & Authorization

### Q: How does JWT auth work here? How is authorization separated from authentication?
* **Answer:** They are two middleware functions, deliberately never merged.
  * **Authentication — "who are you?"** `authenticate` reads the
    `Authorization: Bearer <token>` header, verifies the signature with
    `JWT_SECRET`, and attaches `{ id, role }` to `req.user`. It distinguishes a
    missing token (`MISSING_TOKEN`) from an expired one (`TOKEN_EXPIRED`) from an
    invalid one (`INVALID_TOKEN`), because those mean different things to a client.
  * **Authorization — "what may you do?"** `authorize('ADMIN')` is a middleware
    factory that only inspects `req.user.role`. It knows nothing about tokens.
  * They compose in the route: `router.use(authenticate, authorize('ADMIN'))`.
  * Why it matters: a route can require login without a role restriction by using
    `authenticate` alone, and adding a role later touches one file, not every
    controller.
  * Passwords are hashed with bcrypt (cost 12) in a `pre('save')` hook, so a hash is
    never written by hand at a call site. The `password` field is `select: false`,
    so it is excluded from queries unless explicitly requested at login. Login
    returns the same `INVALID_CREDENTIALS` message for an unknown email and a wrong
    password, to avoid confirming which accounts exist.
* **Code:** `backend/src/middleware/authenticate.js`, `backend/src/middleware/authorize.js`, `backend/src/models/User.js`, `backend/src/controllers/authController.js`

### Q: How does the scheduled trigger authenticate, if it has no user account?
* **Answer:** `POST /api/admin/trigger-ingestion` accepts either an ADMIN JWT (the
  admin UI button) or a shared `X-Ingestion-Secret` header (the external cron
  service, which cannot hold a user session). Both paths reach the same handler; the
  `triggeredBy` field on the log records which one fired. The endpoint is rate
  limited to 10 calls/hour.
* **Code:** `backend/src/routes/admin.js`, `backend/src/controllers/adminController.js:allowIngestionSecret`

---

## 7. System Design

### Q: How would you handle 100,000 job postings ingested per day?
* **Answer:** The current shape breaks in a specific, nameable place first:
  `processRecord` does per-record round trips (a company upsert, a dedup lookup,
  an insert), so 100k records is ~300k round trips. In order:
  1. **Batch the writes** — `bulkWrite` in chunks instead of per-record inserts (§11
     of the plan already calls for batched writes).
  2. **Batch the reads** — look up existing `dedupeHash` values for a whole chunk in
     one `$in` query rather than one at a time.
  3. **Move ingestion off the request path** — a queue (BullMQ + Redis) with retry
     and backoff, so a run is resumable rather than all-or-nothing.
  4. **Partition by source** so sources ingest in parallel instead of sequentially.
  5. **Pre-aggregate trends** nightly rather than computing them per request.
* **Code:** `backend/src/services/ingestion/ingestionRunner.js:processRecord`

### Q: Where would you introduce caching first, and why?
* **Answer:** `GET /api/analytics/trends` — it is public, identical for every
  visitor, expensive (five aggregation pipelines per request), and tolerant of
  staleness, since the underlying data only changes when ingestion runs every six
  hours. A short Redis TTL, or simply invalidating on ingestion completion, would
  remove nearly all of that cost. What *not* to cache first: job search, because it
  is highly parameterised (search, location, company, skill, date, page), so the hit
  rate would be poor and invalidation fiddly.
* **Code:** `backend/src/controllers/analyticsController.js:getTrends`

### Q: How would you redesign ingestion if you added 20 more sources?
* **Answer:** The `SOURCES` registry in `ingestionRunner.js` already makes adding a
  source a one-line change, provided the new fetcher honours the contract: return
  `{ records, errors }`, never throw, and map to the common schema. At 20 sources,
  three things change: (1) sources run concurrently with a bounded pool rather than
  sequentially, since sequential runs would take too long; (2) per-source config
  (rate limits, credentials, schedule) moves out of `env.js` into a config
  collection, so adding a source stops being a redeploy; (3) exact-match dedup
  stops being sufficient — with 20 overlapping sources the near-duplicate rate rises
  sharply, and fuzzy matching moves from "nice to have" to required.
* **Code:** `backend/src/services/ingestion/ingestionRunner.js` (`SOURCES` registry)

---

## 8. Product

### Q: Who is the actual user, and what decision does the skill-gap report help them make?
* **Answer:** A student with limited preparation time before placements, whose real
  question is not "what jobs exist" but **"what should I study this week?"** The
  report answers it against evidence rather than opinion: these are the skills
  actually demanded by postings matching your target role in the last 30 days;
  these you have; these you have started; these you are missing. The roadmap then
  turns each missing skill into a specific resource. The co-occurrence chart adds
  ordering — if employers asking for React usually also ask for Node.js, that pair
  is worth learning together.
* **Code:** `backend/src/services/skillGap/gapEngine.js:computeGap`, `roadmapLookup.js:buildRoadmap`

### Q: Why is the skill-gap engine rule-based rather than ML?
* **Answer:** Because every number in it is traceable. "Why is REST APIs listed as
  missing?" has one answer: it appears in `jobSkills` for postings matching your
  target role, and it is not in your `userSkills`. A learned relevance model would
  produce a score no one in the room — including me — could justify line by line,
  and it would be a black box sitting exactly where the project's credibility lives.
  The three buckets (matched / in progress / missing) come straight from the
  `UserSkill.status` field, and the gap percentage is `|missing| / |demanded|`.
* **Code:** `backend/src/services/skillGap/gapEngine.js`
* **Tests:** `backend/tests/skillGap.test.js`

### Q: What would you build next with another month?
* **Answer:** In priority order:
  1. **Fuzzy dedup** — the known v1 limitation, and the one with a demonstrable
     before/after dedup rate to show for it.
  2. **Union skills on merge** — closes the concrete data-loss case named in §3 above.
  3. **Per-job description fetch for scraped sources** — closes the empty-description
     boundary on the Greenhouse/Lever scrapers, rate-limited and capped so it doesn't
     reintroduce the request-volume problem that ruled it out for v1.
  4. **Trend deltas** — "React demand rose 12% this month" is more useful to a
     student than a static count, and is a natural extension of the existing
     weekly-volume pipeline.

---

## Quick File Map

| Concern | File |
|---|---|
| App wiring, middleware order | `backend/app.js` |
| Env validation (fail-fast) | `backend/src/config/env.js` |
| Auth (who) | `backend/src/middleware/authenticate.js` |
| Authorization (what) | `backend/src/middleware/authorize.js` |
| Central error shapes | `backend/src/middleware/errorHandler.js` |
| Source fetchers (APIs) | `backend/src/services/ingestion/adzuna.js`, `remoteok.js` |
| Source fetchers (scrapers) | `backend/src/services/ingestion/greenhouse.js`, `lever.js` |
| Scraped company seed list | `backend/src/config/scrapeTargets.js` |
| Ingestion orchestration | `backend/src/services/ingestion/ingestionRunner.js` |
| Title normalization | `backend/src/services/normalization/titleNorm.js` |
| Skill extraction | `backend/src/services/normalization/skillExtractor.js` |
| Dedup hashing | `backend/src/services/dedup/dedup.js` |
| Aggregation analytics | `backend/src/services/analytics/trends.js` |
| Skill-gap + roadmap | `backend/src/services/skillGap/gapEngine.js`, `roadmapLookup.js` |
| Data model + indexes | `backend/src/models/` |
| Core-logic tests | `backend/tests/` |
