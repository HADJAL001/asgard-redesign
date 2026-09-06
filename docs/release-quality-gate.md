# Release quality gate

OSGARD can publish a generated project only when engineering and design evidence is stored with that project.

## Required evidence

1. A successful `next build` in the isolated sandbox. The project record must have `build_status` of `passed` or `repaired` and `build_report.verifiedBy` equal to `sandbox`.
2. A completed design review with `design_score >= 80`.

Static analysis, an empty status, and an unverified project are deliberately insufficient. A broken build is never publishable and cannot be overridden by a client request.

`POST /projects/:id/verify-build` saves the result of a non-skipped sandbox run as durable project evidence. Publication reads this stored record rather than trusting client state.

## Production operation

The sandbox needs an isolated build worker with Docker. Set `OSGARD_VERIFY_BUILD=1` on the generation/build worker and provide Docker to that worker. The public Railway API should route verification work to this worker or use a queue; it must never manufacture a successful sandbox verdict when Docker is unavailable.

Until this worker is provisioned, projects can still be created but public publication returns `409` with a precise reason: `build_not_verified`, `build_broken`, `design_not_verified`, or `design_below_standard`. This keeps the published-product promise honest.
