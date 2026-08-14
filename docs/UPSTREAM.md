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

## Snapshot

The upstream code snapshot is stored at:

```text
upstream/legacy-mcp-glpi/
```

Purpose:

- temporary migration reference;
- stable comparison point;
- attribution and license preservation;
- source for carefully adapted Legacy behavior.

Runtime dependency:

```text
NO
```

The final application must continue to build without importing from
`upstream/legacy-mcp-glpi`.

Removal:

```text
This directory may be removed once the Legacy migration is complete.
```
