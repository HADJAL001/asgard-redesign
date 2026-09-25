# OSGARD Typed Intent

The blueprint API now accepts a bounded, tenant-scoped `intent` object:

```json
{
  "audience": "Independent product teams",
  "outcome": "Ship a reviewed application in one session",
  "platform": "web",
  "constraints": ["WCAG AA", "Use existing billing provider"]
}
```

`audience` and `outcome` are normalized to bounded strings. `platform` is one of
`web`, `mobile`, `desktop`, `cross-platform`, or `any`. Constraints are trimmed,
deduplicated, and capped at eight entries. The normalized value is persisted with
the blueprint and included in the ProductContract hash, so changing intent makes
old evidence stale by construction.

This is the contract boundary for the next three-question AI interview and the
visual storyboard compiler. Backward compatibility is preserved: projects that
do not send `intent` continue to use the existing blueprint flow.
