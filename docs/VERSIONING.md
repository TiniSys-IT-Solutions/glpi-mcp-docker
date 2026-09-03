# Versioning and releases

This file is the authoritative release procedure for this repository.

## Active lines

| Reference | Meaning |
| --- | --- |
| `main` | Current production source and source of Docker `latest`. |
| `0.3.x` | Current MCP application and Docker release line. |
| `v0.3.0`, `v0.3.1`, `v0.3.2`, ... | Immutable annotated release tags. |
| `v1-legacy` | Archived original Docker wrapper. |
| `v2` | Historical migration branch retained for traceability. |

`v0.3.0` already exists in the Git history. The later `v0.2.5`, `v0.2.6` and
`v0.2.7` tags were created from commits after it because this document still
incorrectly named `0.2.x` as the current line. Do not reuse, move or delete
those published tags: they remain historical releases. Resume monotonically
from the highest semantic version. The current public release is `v0.3.2`.

## Version sources

Every release must use the same version in:

| File | Value |
| --- | --- |
| `package.json` | top-level `version` |
| `package-lock.json` | root and root-package `version` |
| `src/build-info.ts` | fallback `PRODUCT_VERSION` |
| `test-public/build-info.test.ts` | expected product version |
| `README.md` | current release and image examples |

The Git tag is `v` followed by this exact version. Before choosing it, list all
existing semantic tags and select a version strictly greater than the highest
one; never infer the next tag only from `package.json`.

```bash
git tag --list 'v[0-9]*' --sort=-version:refname
```

## Release procedure

1. Confirm that `main` is current and inspect local changes.
2. Determine the next version from the highest existing semantic tag.
3. Update every version source in the table above.
4. Run the complete validation suite.
5. Commit functional changes separately from documentation/release metadata.
6. Create an annotated tag on the release commit.
7. Push the branch first, then the exact tag.

Example for the present release:

```bash
git status --short
git tag --list 'v[0-9]*' --sort=-version:refname
npm test
npm run build
git diff --check
git add <functional-files>
git commit -m "feat(organization): harden writes and add LDAP updates"
git add README.md docs package.json package-lock.json src/build-info.ts test-public/build-info.test.ts
git commit -m "chore(release): prepare version 0.3.2"
git tag -a v0.3.2 -m "Release glpi-mcp-docker v0.3.2"
git push origin main
git push origin v0.3.2
```

Do not use `git push --tags`: it may publish unrelated local tags.

## Docker publication

GitHub Actions publishes:

- `latest` and a commit-SHA tag after a push to `main`;
- `0.3.2`, `0.3` and a commit-SHA tag after a push of `v0.3.2`.

Release tags are immutable. If a released version is faulty, fix it in a new
patch version rather than moving its tag.
