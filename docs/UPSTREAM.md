# Upstream Reference

## Source

```text
https://github.com/GMS64260/mcp-glpi
```

## Selected Baseline

```text
Tag: v3.3.0
Commit: 0f8e802c39a6b37156ad2e315c0b9a8d0e26056e
Date checked: 2026-08-14
License: MIT
```

`v3.3.0` was retained because it is the version already pinned by the V1 Docker
wrapper and includes the document upload additions from 2026-08-05.

The currently observed upstream tags were:

```text
v3.2.0
v3.3.0
```

## Source retention

The temporary source snapshot used during migration was removed in `0.2.4` to
avoid shipping duplicate, inactive code and an obsolete dependency lockfile in
the public repository. It remains recoverable from Git history. The exact
upstream tag and commit above are the canonical comparison point.

The application has no runtime or build dependency on the upstream checkout.
