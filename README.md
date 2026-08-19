# Career Connect — Career Opportunity Aggregation & Placement Intelligence Platform

Career Connect is a full-stack data pipeline and placement intelligence platform built with Node.js, Express, MongoDB Atlas, and React. It periodically ingests job postings from two public APIs (Adzuna, RemoteOK) and two scraped sources — 37 companies across the Greenhouse and Lever applicant-tracking platforms, via a Cheerio HTML scraper (`services/ingestion/greenhouse.js`, `lever.js`) — normalises and deduplicates all four into a clean canonical dataset, and computes actionable placement intelligence — including in-database hiring trends and personalized skill-gap analysis with prep roadmaps.

> **Engineering Thesis:** "I built a pipeline that ingests messy, heterogeneous external data on a schedule, normalizes and deduplicates it with fully explainable rule-based logic, and turns it into personalized, defensible output — a skill-gap report computed against real posting data — using aggregation-pipeline analytics computed in the database, not looped over in application code."

---

## Architecture Overview

```text
                       ┌───────────────────────────┐
                       │     External Sources       │
                       │  Adzuna API + RemoteOK API │
                       │  + Greenhouse/Lever scrape │
                       │  (37 companies, Cheerio)   │
                       └────────────┬───────────────┘
                                    │  scheduled hit (Render Cron / cron-job.org)
                                    ▼
                       ┌───────────────────────────┐
                       │   Ingestion Service        │
                       │   (ingestionRunner.js)     │
                       └────────────┬───────────────┘
                                    ▼
                       ┌───────────────────────────┐
                       │ Normalization + Dedup      │
                       │ (titleNorm, dedup.js)     │
                       └────────────┬───────────────┘
                                    ▼
                       ┌───────────────────────────┐
                       │        MongoDB             │
                       │ jobs / companies / skills  │
                       │ users / userSkills / logs  │
                       └────────────┬───────────────┘
                                    │
                                    ▼
                       ┌───────────────────────────┐
                       │   Node.js + Express API    │
                       └────────────┬───────────────┘
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
        Job Search API       Analytics Module       Skill-Gap Engine
        (Pagination/Text)    (MongoDB Aggregation)   (Set Arithmetic)
              │                     │                     │
              └─────────────────────┼─────────────────────┘
                                    ▼
                       ┌───────────────────────────┐
                       │      React Frontend        │
                       │ Search · Dashboard ·      │
                       │ Skill Gap · Admin Control │
                       └───────────────────────────┘
```

---

## Tech Stack & Decisions

| Layer | Choice | Rationale |
|---|---|---|
| **Backend** | Node.js + Express | Portfolio slot for MERN capability |
| **Database** | MongoDB Atlas | Referenced ObjectIds for M:N relations, `$lookup` in aggregation |
| **Ingestion Trigger** | External Trigger (POST `/api/admin/trigger-ingestion`) | Render free-tier spins down idle services, killing in-process `node-cron`. External pinger wakes up service reliable. |
| **Web Scraping** | Cheerio (Greenhouse + Lever board HTML) | No API exists for individual companies; one parser per shared ATS template, parameterized by company slug, covers 37 companies — see `config/scrapeTargets.js` |
| **Deduplication** | SHA-256 Hash (`title + company + location`) | Exact-match deduplication with `sources[]` lineage array merge |
| **Analytics** | MongoDB Aggregation Pipelines | Computed in-database (`$match`, `$group`, `$lookup`, `$sort`), zero JS looping — including skill co-occurrence |
| **Frontend** | React + Recharts | Responsive dark-mode dashboard |

---

## Local Setup & Quick Start

### Prerequisites
- Node.js (v18+)
- MongoDB Atlas account (or local MongoDB server)

### 1. Backend Setup
```bash
cd backend
cp .env.example .env
# Fill in MONGODB_URI and JWT_SECRET in .env

# Install dependencies
npm install

# Seed the database with canonical skills, test companies, jobs & accounts
npm run seed

# Run tests
npm test

# Start backend dev server (port 5000)
npm run dev
```

### 2. Frontend Setup
```bash
cd frontend
cp .env.example .env

# Install dependencies
npm install

# Start Vite dev server (port 5173)
npm run dev
```

---

## Default Seed Credentials

After running `npm run seed`:

- **Admin Account**: `admin@careerconnect.dev` / `Admin123!`
- **Student Account**: `student@careerconnect.dev` / `Student123!`

---

## Ingestion API Trigger

To trigger an ingestion run manually via cURL or external cron service:

```bash
# Using Admin JWT:
curl -X POST http://localhost:5000/api/admin/trigger-ingestion \
  -H "Authorization: Bearer <ADMIN_JWT_TOKEN>"

# Using Secret Header (for external cron services like cron-job.org):
curl -X POST http://localhost:5000/api/admin/trigger-ingestion \
  -H "X-Ingestion-Secret: <INGESTION_SECRET>"
```

---

## Core Logic Tests

Run the test suite covering exact-match deduplication, title normalization, skill-gap computation, and skill extraction word-boundary matching:

```bash
cd backend
npm test
```

**87 tests across 7 suites**, no database required — every tested function is pure:

| Suite | Covers |
|---|---|
| `tests/dedup.test.js` | Hash determinism, field sensitivity, case/whitespace insensitivity, and the documented exact-match boundary |
| `tests/titleNorm.test.js` | Alias mapping, noise stripping, and the intern guard (an internship must not normalize to its full-time counterpart) |
| `tests/skillGap.test.js` | Gap arithmetic and the matched / in-progress / missing classification, including the §4 worked example |
| `tests/skillExtractor.test.js` | Alias expansion and word-boundary matching (`Java` must not match inside `JavaScript`) |
| `tests/textClean.test.js` | Encoding repair and HTML-entity decoding, including that accented and CJK text is left intact |
| `tests/greenhouse.test.js` | HTML-parsing correctness against a real saved board page fixture, including a regression test for a "New"-badge title-corruption bug found during development |
| `tests/lever.test.js` | Same, against a real Lever board fixture with 300+ live postings, proving the per-company row cap actually caps output |

---

## Measured Pipeline Behaviour

Numbers produced by the running system, not estimates:

**Deduplication.** The seed data deliberately includes one posting described two ways by two sources (`"Software Development Engineer I"` and `"SDE 1 - Backend"` at ExampleCorp/Bangalore). Both normalize to the same canonical title and merge:

```text
[Seed] Jobs processed — Inserted: 5, Deduplicated: 1     → 16.7% dedup rate
```

Against the live RemoteOK API, re-running ingestion is fully idempotent — the second run merges every record instead of inserting duplicates:

```text
run 1 | jobs: 201 | inserted: 196  deduped:   0
run 2 | jobs: 201 | inserted:   0  deduped: 196     → 100% dedup rate on re-ingest
run 3 | jobs: 201 | inserted:   0  deduped: 196
```

`sources[]` stays bounded at one entry per distinct source across all runs (max length 2), which is what makes embedding it the right call.

**Per-source failure isolation.** With Adzuna credentials absent, that source fails alone and is logged separately while RemoteOK ingests normally:

```text
adzuna    fetched:   0  inserted:   0  deduped:   0  errors: 1
remoteok  fetched: 196  inserted: 196  deduped:   0  errors: 0
```

**Normalization quality.** After a live run, every stored job title, location, and company name was checked for mis-decoded UTF-8, undecoded HTML entities, and replacement characters:

```text
DATA QUALITY: unclean title/location/company strings: 0 of 578 checked
```

Accented and CJK text (`Heart's Content`, `São Paulo`, `那覇都市部`) is preserved rather than stripped — the cleanup repairs damaged encodings without flattening legitimate non-ASCII text.

**Web scraping.** Against the live Greenhouse and Lever board pages for all 37 configured companies:

```text
greenhouse  companies: 28  fetched: 1002  errors: 0  duration:  50.1s
lever       companies:  9  fetched:  285  errors: 0  duration:  12.3s
                                total: 1287 scraped records, 0 companies failed
```

Every one of the 37 slugs in `config/scrapeTargets.js` was individually verified to return real records through the actual scraper before being added — not assumed from the platform's own JSON API existing, which turned out to disagree for a meaningful fraction of companies (see `DESIGN.md` correction #12: 16 of the first 22 JSON-API-verified Greenhouse companies redirect to a fully custom careers page their board scraper cannot parse).

---

## Analytics Endpoints

All five trend datasets are computed by aggregation pipelines in `services/analytics/trends.js`:

| Metric | Pipeline |
|---|---|
| Top in-demand skills | `$lookup` → `$match` (date) → `$group` → `$sort` → `$limit` |
| Postings by company | `$match` → `$group` → `$lookup` → `$sort` |
| Postings by location | `$match` → `$group` → `$sort` |
| Posting volume over time | `$match` → `$group` (ISO year+week) → `$project` |
| **Skill co-occurrence** | `$group` (per job) → `$unwind` ×2 (self cross-product) → `$match` (`$lt` pair guard) → `$group` → `$sort` |

Sample co-occurrence output from live data — the pairings a student can act on:

```text
JavaScript + React = 8    Go + Git = 8
JavaScript + REST APIs = 7    TypeScript + React = 6
```
