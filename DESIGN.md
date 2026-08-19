# Architectural & Design Choices — Career Connect

This document outlines the technical design decisions, trade-offs, data-modeling strategies, and explicit scoping boundaries for Career Connect.

---

## 1. Trade-Off Analysis & Technology Choices

### Backend: Node.js + Express
* **Choice:** Node.js + Express.
* **Reasoning:** Fits the conventional MERN slot in the portfolio (the candidate's other 4 projects are Python/AI-backed). Demonstrates plain full-stack engineering, async pipeline orchestration, and REST design in JavaScript.

### Database: MongoDB (Atlas)
* **Choice:** MongoDB with referenced collections and `$lookup` aggregations.
* **Reasoning:** Despite Job ↔ Skill ↔ User having a relational shape, MongoDB was chosen deliberately to demonstrate MERN range. Relationships are handled via ObjectIds and `$lookup` rather than embedding arrays of full entities.

### Scheduling: External Trigger vs In-Process node-cron
* **Resolution:** External Trigger (`POST /api/admin/trigger-ingestion` via Render Cron or cron-job.org) instead of `node-cron`.
* **Reasoning:** In-process schedulers like `node-cron` run inside the Node process. On free cloud hosts like Render, the service spins down after 15 minutes of inactivity. When the service sleeps, `node-cron` timers silently stop firing. An external HTTP trigger waken the service up on schedule, processes ingestion, and allows it to sleep again safely.

### Deduplication: Exact-Match Hash vs Fuzzy Matching
* **Choice:** SHA-256 exact-match hash on `normalize(title) + '|' + normalize(company) + '|' + normalize(location)`.
* **Reasoning:** Exact-match hashing provides a fast, deterministic, fully explainable, and 100% testable logic block. Fuzzy-matching (Jaccard/Levenshtein similarity) is a natural v2 feature but incurs significant time cost and edge-case ambiguity for marginal incremental portfolio signal.

### Ingestion breadth: API-only vs. API + web scraping
* **Choice:** Two API sources (Adzuna, RemoteOK) **plus two scraped sources** (`services/ingestion/greenhouse.js`, `services/ingestion/lever.js`), all registered identically in `ingestionRunner.js`'s `SOURCES` array.
* **Reasoning — why scraping earns its place instead of being redundant with the APIs:** an API is a source *choosing* to hand a program clean JSON on purpose. Most individual companies never build one — Adzuna/RemoteOK are third-party aggregators, not the companies themselves. Scraping is the only way to pull structured postings out of a company's own careers presence when no API exists, and it exercises a genuinely different skill (parsing uncontrolled HTML, handling template drift, graceful degradation) than "call a documented endpoint."
* **Why Greenhouse and Lever specifically, not scraping companies' own bespoke career pages one at a time:** most companies don't hand-build their careers page — they use a shared Applicant Tracking System. Every company on Greenhouse (or on Lever) renders the *same* board template; only the company slug and the underlying job data differ. This means **one parser per platform, parameterized by company slug**, not one scraper per company — see `config/scrapeTargets.js`. This is the mechanism that makes "aggregated from N companies" a real, scaling number rather than N bespoke, individually fragile scrapers.
* **Why the seed list required verifying every slug twice, not once:** during development, an ATS-existence check (hitting each platform's own unofficial JSON board endpoint, e.g. `boards-api.greenhouse.io/v1/boards/{slug}/jobs`) was used only to confirm a company uses the platform at all — never to fetch ingestion data, since consuming ready-made JSON there would not exercise the scraping logic this module exists to demonstrate. That check is *not* sufficient evidence a company belongs in `scrapeTargets.js`: roughly 16 of the first 22 Greenhouse-verified companies (Stripe, Airbnb, Coinbase, Databricks, and others) redirect their public board to a fully custom, bespoke careers page on their own domain instead of rendering the shared template — `boards.greenhouse.io/stripe` 302s to `stripe.com/careers/search`, which is not something this scraper's selectors were built to parse. Every slug actually committed to `scrapeTargets.js` was re-verified by running the real `parseGreenhouseBoard()`/`parseLeverBoard()` against the live HTML and confirming it returns real records — not by the JSON check alone. See `config/scrapeTargets.js`'s header comment for the same point in context.
* **Why scraped records carry an empty `description`:** the board *listing* page (one request per company) yields title, location, and a link for every open role. The full description lives on each job's own detail page. Fetching those individually would multiply request volume by the total number of open roles across every configured company — for 37 companies that is hundreds of extra requests for a portfolio-scale ingestion run. Scraped jobs are therefore ingested with `description: ''`; skill extraction naturally finds fewer matches on them than on the API sources. This is a real, explainable scraping-at-scale trade-off, not an oversight — see `greenhouse.js`'s file header.
* **robots.txt compliance:** `boards.greenhouse.io/robots.txt` disallows only `/embed/` (unused here). `jobs.lever.co/robots.txt` has a general `User-agent: * / Allow: / / Crawl-delay: 1` entry permitting scraping, plus separate named-bot disallow entries (`GPTBot`, `ClaudeBot`, `CCBot`, etc.) that target AI-training/AI-crawler identities specifically — not a script honestly identifying itself with its own descriptive `User-Agent`, as both scrapers here do. `lever.js` respects the published 1-second crawl delay between company requests.

---

## 2. Data Modeling Strategy: Reference vs Embed

| Entity Pair | Relationship | Decision | Rationale |
|---|---|---|---|
| **Job ↔ Company** | Many-to-One | **Reference** | Companies have independent identity, independent query needs (postings-by-company analytics), and their own lifecycle. Embedding company data on every job causes update anomalies. |
| **Job ↔ Skill** | Many-to-Many | **Reference (`JobSkill`)** | Millions of job-skill pairings exist. Aggregation pipelines group by `skillId` across `JobSkill` documents. Embedding skills as strings on Job would require expensive `$unwind` scans over full job text. |
| **User ↔ Skill** | Many-to-Many | **Reference (`UserSkill`)** | Allows independent querying of user skills with proficiency and status fields (`learning` vs `proficient`). |
| **Job ↔ Sources** | One-to-Many | **Embed (`sources[]`)** | Embedded inside `Job`. Source entries are small (3 fields), bounded (2-5 entries max), always accessed with the job, and have no independent query identity. |

---

## 3. In-Database Analytics vs Application-Code Looping

Trend analytics (top skills, postings by company/location, weekly volume, and skill co-occurrence) are executed entirely in-database using MongoDB Aggregation Pipelines:

```javascript
JobSkill.aggregate([
  { $lookup: { from: 'jobs', localField: 'jobId', foreignField: '_id', as: 'job' } },
  { $unwind: '$job' },
  { $match: { 'job.postedDate': { $gte: since }, 'job.isActive': true } },
  { $group: { _id: '$skillId', count: { $sum: 1 } } },
  { $lookup: { from: 'skills', localField: '_id', foreignField: '_id', as: 'skill' } },
  { $unwind: '$skill' },
  { $project: { _id: 0, skillId: '$_id', name: '$skill.name', category: '$skill.category', count: 1 } },
  { $sort: { count: -1 } },
  { $limit: limit }
]);
```

**Why this matters:**
Pulling thousands of documents into Node.js memory to run JavaScript `.filter()` or `.reduce()` loops causes heavy network overhead, high memory usage, and poor scaling. Running aggregation pipelines delegates counting and joining to MongoDB's C++ engine using indexes.

**The sharpest example — skill co-occurrence.** "Which skills are demanded *together*?" is the one metric where the application-code version is obviously worse: it means loading every job's skill set and building pairs with a nested loop. The pipeline version instead unwinds each job's skill set against itself to form the cross product, then keeps one canonical ordering per unordered pair with a single comparison:

```javascript
{ $group: { _id: '$jobId', skills: { $addToSet: '$skillId' } } },
{ $match: { 'skills.1': { $exists: true } } },   // needs >= 2 skills to form a pair
{ $project: { skillA: '$skills', skillB: '$skills' } },
{ $unwind: '$skillA' },
{ $unwind: '$skillB' },
{ $match: { $expr: { $lt: ['$skillA', '$skillB'] } } }, // drops (Y,X) dupes AND self-pairs
{ $group: { _id: { skillA: '$skillA', skillB: '$skillB' }, count: { $sum: 1 } } }
```

The `$lt` guard works because ObjectIds have a well-defined BSON ordering, so it deterministically picks one direction per pair. Sorting and limiting happen *before* the `$lookup`s that resolve skill names, so names are only fetched for the rows actually returned.

---

## 4. Scoping & Explicitly Out of Scope (v1)

The following were explicitly excluded from v1 to ensure a tight, defensible portfolio build:
1. **Fuzzy/Near-Duplicate Matching:** Deferred to v2. Exact-match hash already proves deduplication capability.
2. **Scored ML Recommendation Engine:** Rule-based skill-gap analysis is 100% explainable under live questioning, unlike black-box ML scoring models.
3. **Admin Pipeline Health Dashboard:** User-facing analytics already prove aggregation pipeline mastery; redundant admin views add low signal.

**Revision note — item removed from this list, not silently dropped:** the original v1 scope excluded *"Broad Multi-Company Scraping (150+ sites)"*, reasoning that per-company custom scrapers would be too fragile and time-consuming for a solo build. That reasoning held for the rejected approach — scraping each company's own bespoke page individually — but not for the approach actually built: one parser per shared ATS template (Greenhouse, Lever), parameterized by company slug (§1, "Ingestion breadth"). That reduces "cover many companies" from "write many scrapers" to "verify and list many slugs," which is a fundamentally different, much more tractable engineering problem. Scraping was promoted from excluded to core scope for this reason, covering 37 real, individually-verified companies across the two platforms — see `config/scrapeTargets.js`. What remains explicitly out of scope is reproducing the *specific* unverified original resume figures ("150+ companies," "13,000+ students," "40%/65% improvement") as claims — this build reports whatever real count and dedup rate the running system actually produces on a given ingestion run, the same honesty principle already applied to the 196-postings/100%-dedup numbers from the two API sources.

---

## 5. Assumptions Made During Build

1. **JWT Storage in `localStorage`:** Chosen for standard MERN simplicity. Production upgrade path: HttpOnly, Secure, SameSite cookies to mitigate XSS risks.
2. **Adzuna Query Defaults:** Search defaults to `"software engineer"` in the configured country region (`gb`/`in`), customizable via `.env`. Adzuna requires credentials; without them the source reports a configuration error in its ingestion log and the other source proceeds normally.
3. **Skill Extractor Word Boundaries:** RegEx uses `(?<![a-zA-Z0-9])` and `(?![a-zA-Z0-9])` lookarounds instead of standard `\b` to correctly handle special characters in skills like `C++` and `Node.js` without false-matching `Java` inside `JavaScript`.
4. **`targetRole` is free text, matched with `$text`:** Users are not forced into a fixed role taxonomy. The consequence is that the skill-gap report is only as precise as the phrase entered, and a role with no recent postings returns an explicit empty-state message rather than a misleading 0% gap.
5. **Gap percentage counts only fully-absent skills:** A skill the user marked "in progress" is reported in its own bucket and excluded from the gap numerator, per §6.5's definition (`|Missing| / |jobSkills|`). Roadmap items are likewise generated only for missing skills, so a skill already being learned does not generate advice to start learning it.
6. **Skills are not re-extracted when a duplicate is merged:** The first source to supply a posting determines its skill links. If a second source's description mentions additional skills, they are currently not added. Unioning the extracted sets on merge is the natural fix and is listed below as v2.
7. **Scraped board pages are capped per company (50 for Greenhouse, 40 for Lever), not fetched exhaustively:** Greenhouse's own legacy board template already caps its rendered table at 50 rows, so that ceiling mostly documents an existing limit rather than imposing a new one. Lever renders every open role server-side with no such cap — one company returned 308 rows in a single fetch during development — so its 40-row ceiling is a deliberate choice to keep any single large employer from dominating the aggregated dataset, given companies are visited in the fixed order configured in `scrapeTargets.js`.
8. **Scraped postings do not carry a real `postedDate`:** the board listing page exposes no date field (unlike each platform's JSON API, which has `updated_at`/similar). Scraped records default to the ingestion run's timestamp, the same fallback pattern already used elsewhere in the codebase for missing dates. This means "most recent first" sorting is not meaningful for scraped-only postings the way it is for the two API sources — a known, documented boundary rather than a bug.

---

## 6. Corrections Made After the First Build Pass

These were found by reviewing the implementation against the project plan and by running the pipeline against a live database and the real RemoteOK API. Each is recorded here because the behaviour before the fix was plausible-looking but wrong.

| # | Problem | Why it mattered | Resolution |
|---|---|---|---|
| 1 | **Skill co-occurrence analytics was missing.** §6.6 of the plan lists it as a trend metric. | It is the single most senior-looking pipeline in the codebase and the one metric that is genuinely awkward to do in application code — exactly the differentiator the build was supposed to showcase. | Added `getSkillCooccurrence` in `services/analytics/trends.js`, surfaced through `/api/analytics/trends`, charted on the Trends page. |
| 2 | **The skill-gap engine had no "partially matched" bucket.** §4 of the plan reports `DSA (in progress)` as partially matched, and `UserSkill.status` was documented as driving that classification — but the engine folded those skills into `matched`. | The distinction between "I know this" and "I'm halfway through this" is the actionable part of the report; merging them hid it. | `computeGap` now returns three disjoint buckets. `gapPercent` is unchanged, still `|missing| / |demanded|`. |
| 3 | **A failing Jest test.** `computeDedupeHash` did not normalise its own inputs. | Beyond the red test, this was a real dedup hole: `normalizeTitle` preserves display casing, so two sources posting the same unaliased title in different cases hashed differently and were never merged. | `computeDedupeHash` now applies `normalizeForHash` to each component (the function is idempotent, so pre-normalised input is unaffected). |
| 4 | **Internships collapsed into full-time roles.** Alias matching is substring-based, so `"Frontend Engineer Intern"` matched the shorter `'frontend engineer'` entry and normalised to `"Frontend Engineer"`. | This is a *false merge* — an internship and a full-time role at the same company and location would become one record. On a platform for students, that is the most damaging dedup error possible. | `normalizeTitle` re-attaches the intern marker after alias resolution. Covered by `tests/titleNorm.test.js`, including that `"Internal Tools Engineer"` is not caught. |
| 5 | **RemoteOK ingested zero records with the shipped default config.** Its API accepts only ONE tag per request; `?tag=dev,backend` is read as a single literal tag, matches nothing, and returns HTTP 200 with an empty payload. | A silent zero-record success — no error logged, indistinguishable from "no new jobs". One of the two required core sources was effectively dead. | The fetcher now issues one request per configured tag (~1s apart, per §9's rate-limit requirement) and merges on RemoteOK's post id. An empty tag result is now logged explicitly. Verified live: 0 records → 196. |
| 6 | **`sources[]` grew without bound.** The merge path used `$addToSet` on a subdocument containing a fresh `fetchedAt`, so entries were never equal and every scheduled run appended another copy of the same source. | This directly invalidated the reason `sources[]` is embedded — that it is small and bounded — which is the project's most-defended design decision. At 4 runs/day a job would accrue ~120 entries/month against a 16MB document ceiling. | The merge now updates the matching source entry in place via the positional `$` operator and only pushes for a genuinely new source name. Verified: across three consecutive ingestion runs the maximum array length stays at 2. |
| 7 | **Company filter was applied after pagination.** `jobController` filtered the already-paginated page in JavaScript while `total`/`pages` still described the unfiltered set. | Filtering by company on a 20-per-page result could return 2 jobs while reporting 500 results across 25 pages. | The company name is now resolved to ObjectIds before the query, so the filter, the count, and the page all describe the same set. |
| 8 | **User input was interpolated into `$regex` unescaped.** | Per §9 ("never trust data received from the client"), a value like `C++` throws on an invalid quantifier and a crafted pattern can force catastrophic backtracking. | Added an `escapeRegex` helper in `jobController` and `skillController` and applied it to every user-supplied regex filter. |
| 9 | **Text from external sources was stored damaged.** Two separate problems: HTML entities were never decoded (`"Alexander & Bebout"` stored as `"Alexander &amp; Bebout"`), and RemoteOK serves text that is already UTF-8-decoded-as-Latin-1, so `"Heart's Content"` arrived as `"Heartâs Content"`. | Both feed `normalizedName` and the dedup key, so one employer could split across several spellings — and both render as visible garbage in the UI. | Added `services/normalization/textClean.js` with `repairMojibake` + `decodeEntities`, applied by both fetchers. Verified on a live run: 0 damaged strings out of 578 checked, with accented and CJK text preserved intact. |
| 10 | **`DEFENSE_PREP.md` pointed at a different machine's filesystem** (`file:///c:/Users/User3/...`) and answered only 8 of the 20 questions in §19 — with no Authentication, System Design, or Product sections. | It is the student's study sheet; dead links and missing sections make it unusable for its one purpose. | Rewritten against repo-relative paths, covering every §19 question. |

**Not changed, deliberately:** the §4 example in the plan shows `"Bangalore"` and `"Bangalore (Remote-friendly)"` merging. Exact-match dedup does not merge these, and fuzzy matching is explicitly out of scope per §22. Rather than quietly special-casing it, the boundary is pinned by a named test (`dedup boundary: a differing location string does NOT merge`) so it can be discussed as a known limitation instead of discovered live.

| # | Problem | Why it mattered | Resolution |
|---|---|---|---|
| 11 | **Greenhouse's "New" badge leaked into scraped titles.** The badge is rendered as a nested `<span class="tag-container">New</span>` *inside* the same `<p>` element as the title text, so a plain `.text()` call on the title element produced `"Senior Software Engineer, Data PlatformNew"`. | Silent, structural title corruption — not a crash, so nothing would have surfaced it without inspecting real extracted output against the source page. Corrupted titles also feed the dedup hash, so the same role could fail to merge with itself across runs depending on whether it was freshly posted at fetch time. | `parseGreenhouseBoard` now clones the title element and removes `.tag-container` before extracting text. Pinned by a named regression test in `tests/greenhouse.test.js`. |
| 12 | **A company's JSON-API existence does not mean its board page is scrapable.** Initial development verified 22 Greenhouse company slugs against `boards-api.greenhouse.io`'s JSON endpoint, all returning real job counts, and assumed that was sufficient. Running the *actual* HTML scraper against those same 22 companies showed 16 returned zero records. | Every one of the 16 redirects `boards.greenhouse.io/{slug}` to a fully custom, bespoke careers page on the company's own domain (`stripe.com/careers/search`, `careers.airbnb.com`, `www.coinbase.com/careers`, etc.) instead of rendering the shared board template this scraper's selectors target. A seed list built from the JSON check alone would have shipped with a ~73% per-run failure rate, each failure producing a misleading "page layout may have changed" log line for a company that was never actually parseable to begin with. | `config/scrapeTargets.js` now lists only slugs verified against the *real* `parseGreenhouseBoard()`/`parseLeverBoard()` output, not the JSON check. The final list (28 Greenhouse + 9 Lever = 37 companies) was built by widening the search until enough real, working slugs were found — see that file's header comment for the full method. |

---

## 7. Proposed v2 Directions (not built — per §22)

Recorded here rather than implemented, in scope-order:

1. **Fuzzy/near-duplicate dedup** — the known v1 limitation, with a measurable before/after dedup rate.
2. **Union skill sets on merge** — closes the data-loss case in Assumption 6 above.
3. **Denormalise `postedDate` onto `JobSkill`** — lets the date filter run before the `$lookup` in `getTopSkills`, which is where that pipeline would first hurt at scale.
4. **Seniority-aware title normalization** — generalises the intern guard (correction 4) to `Senior`/`Staff`/`Lead`.
5. **Per-job description fetch for scraped sources, rate-limited and capped** — closes the empty-`description` boundary (Assumption 6 in §1's "Ingestion breadth" and Assumption 8 above) by fetching each job's own detail page, but only up to a small per-run budget, so skill extraction can run on scraped postings too without the request-volume blowup that ruled it out for v1.
6. **A third-template handler for Greenhouse's newer Next.js-rendered boards** — during development of `scrapeTargets.js`, a handful of companies were found to render their listings inside an embedded `<script id="__NEXT_DATA__">` JSON blob rather than the legacy `tr.job-post` HTML table this scraper targets (see correction #12). Most such companies turned out to redirect to a fully bespoke domain outside Greenhouse's own template entirely, but a `parseGreenhouseBoardNextData()` variant — detecting and parsing that embedded JSON the same way `parseGreenhouseBoard()` parses the DOM — would recover the subset that stayed on Greenhouse's own domain, growing the verified company count further without needing a headless browser.
7. **Headless-browser fallback (Puppeteer/Playwright) for fully client-rendered career pages** — the handful of companies whose careers page renders its listings via client-side JavaScript with no server-rendered HTML and no embedded JSON state (e.g. Instacart's board, discovered during development) are unreachable by Cheerio by construction. A headless browser could recover these at a real cost in speed and resource usage per company — a deliberate v1 boundary worth naming directly if asked, not a gap to apologize for.
