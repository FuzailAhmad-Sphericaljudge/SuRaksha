# Data governance

The current privacy notice version is `2026-09-20`. Consent receipts are versioned and append-only. Users can download a JSON export that omits password hashes, session tokens and private storage keys, and can submit an account deletion request for reviewed processing.

Original evidence remains private. Public profiles expose report text only after review and show media counts rather than original files. A future redaction pipeline must create a separate derivative; it must never overwrite the original evidence object.

Production retention periods require legal review before launch. Until then, no automatic destructive purge runs. Deletion and takedown requests enter the reviewer queue so identity, safety preservation, legal holds and dependent records can be checked before removal.

Third-party data may be imported only with documented provenance, permitted reuse and a freshness owner. Analytics describe database coverage and must not be presented as safety scores.
