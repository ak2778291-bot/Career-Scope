'use strict';

const mongoose = require('mongoose');

/**
 * Company collection.
 *
 * Data-modeling note — why REFERENCE (not embed on Job):
 *   Companies have independent identity: the same company appears across many job
 *   postings, and we query them independently (postings-by-company analytics,
 *   admin views). Embedding company data inside every Job document would mean
 *   updating the company name in N places if it ever changes — a classic update
 *   anomaly that references avoid entirely.
 *
 *   Contrast with the sources[] array on Job, which IS embedded: each source entry
 *   is small (name + url + fetchedAt), has no independent query need, and its
 *   lifecycle is tied to the job document it describes.
 */
const companySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Company name is required'],
    trim: true,
  },
  /**
   * normalizedName — lowercase, punctuation-stripped version of name.
   * Used as the upsert key in ingestionRunner to detect the same company
   * arriving with slightly different formatting across sources
   * (e.g. "Google LLC" and "Google Inc" both normalise to "google").
   * Unique index here prevents duplicate company documents.
   */
  normalizedName: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
});

module.exports = mongoose.model('Company', companySchema);
