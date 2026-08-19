import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function Pagination({ page, pages, onPageChange }) {
  if (pages <= 1) return null;

  return (
    <div className="flex-between" style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
      <button
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="btn btn-outline"
        style={{ opacity: page <= 1 ? 0.5 : 1 }}
      >
        <ChevronLeft size={16} /> Previous
      </button>

      <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
        Page {page} of {pages}
      </span>

      <button
        disabled={page >= pages}
        onClick={() => onPageChange(page + 1)}
        className="btn btn-outline"
        style={{ opacity: page >= pages ? 0.5 : 1 }}
      >
        Next <ChevronRight size={16} />
      </button>
    </div>
  );
}
