# Threat model

SafePG handles student safety reports, private media and identity-linked workflows. Primary risks are unauthorized evidence access, malicious or misleading reports, owner suppression, reviewer account compromise, accidental disclosure through notifications, and bulk abuse.

Controls in the current release include authenticated private originals, media signature checks and size limits, role and ownership checks, reviewer-only publication and resolution, reversible duplicate handling, student-controlled guardian access, generic external notifications, structured audit events and per-user grievance throttling. Public profiles never expose reporter identity or original media.

Before production launch, deployment must add managed secrets, TLS, edge rate limits, malware scanning, encrypted backups, centralized security logs, incident response contacts and a completed penetration test. Reviewer accounts require strong provider authentication and multi-factor authentication.

Abuse reports and privacy requests remain durable records. Operators must not delete source evidence merely because a takedown request is submitted; they should restrict publication while preserving legally required audit history.
