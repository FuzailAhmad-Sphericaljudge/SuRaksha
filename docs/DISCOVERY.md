# Phase 06 discovery

The visual page now has a client-side discovery surface backed by the explicitly fictional fixture set. A query matches property name and display address; a type filter narrows to PG, hostel or coaching. Empty results are visible and reversible. A card click selects a property and opens a profile detail section showing identity status and the limitation that the address/building still needs confirmation.

The contract package exposes `discoveryQuerySchema`, `discoveryResultSchema` and `discoveryResponseSchema`. Results carry their own `dataMode: "demo"`, type, display address, match reason and identity status. Pagination is bounded by the shared cursor/limit contracts. These schemas and fixtures do not imply a live index, geocoding, map provider or property verification.

The current client filtering is deliberately local and synchronous. The API will receive the same query/filter contract once persistence and registry routes are implemented. Until then, search copy and result labels explicitly say fictional/demo and no live property may be selected as verified. Address/building identity is a separate confirmation step; a matching string never proves that a report belongs to a property.
