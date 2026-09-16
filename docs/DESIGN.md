# Reference design and 3D brief

Reference: user-provided Screen Recording 2026-09-15 233155.mp4, approximately 67 seconds. Local source video is not committed.

Observed visual direction: LANDMARK architectural website, rounded full-width building hero, lower-left headline, clean white editorial sections, generous whitespace, asymmetric building images, rounded multi-column property grid, large architectural media panels and a dark blue-grey footer/form. A blue brand loading screen appears in the recording.

Preserve the reference's composition, image scale, spacing, typography character and visible motion while adapting all content and journeys to SafePG only. Do not generate unrelated studio or fintech variants.

The recording alone does not establish whether source visuals are live Three.js, rendered videos or photography. Exact asset/camera matching depends on obtaining the original licensed models/media or creating close custom assets. Do not promise identical assets from screenshots.

## Implementation slices

1. Responsive reference-matched layout and explicitly labeled demo content.
2. Asset inventory and representative architectural hero; decide video versus live 3D based on source evidence and available assets.
3. Motion choreography from closer reference review: record transitions, section behavior and timing before implementation.
4. Three.js illustrative hostel with floor selection and linked issue hotspots.
5. Optional property-specific geometry only from verified plans; show provenance and accuracy limitations.

## Phase 04 implementation

The responsive visual foundation now follows the reference's large rounded architectural hero, restrained navigation, oversized editorial typography, generous white space, asymmetric profile cards, blue-grey information sections and dark footer. Address search is an explicitly non-live preview that leads to fictional profiles. The illustrative floor-area panel and report timeline are product previews, not verified findings or evacuation guidance.

The hero uses an original generated architectural asset at `apps/web/public/images/hero-student-housing.webp`. It depicts a fictional modern student residence at dusk, with no brand, text or identifiable real property. Phase 05 adds two fictional companion scenes, optimized WebP delivery and cinematic motion. Phase 16 owns interactive Three.js issue hotspots.

Address search and access to reports stay obvious. Landing-page animation must not block core tasks. Provide a static/reduced-motion fallback, touch/keyboard alternatives, lazy loading and mobile performance checks. A generic 3D model is illustrative, not a surveyed digital twin or evacuation guide.

Public-facing media shows only cleared/redacted evidence; original files are never embedded directly. Demo 3D pins must never be presented as verified findings at a real property.
