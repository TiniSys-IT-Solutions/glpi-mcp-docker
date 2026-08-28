# Versioning and release branches

This project uses semantic versions while it is still pre-1.0:

- `0.2.x`: current MCP application and Docker distribution;
- `v0.2.0`, `v0.2.1`, ...: immutable release tags;
- `main`: current production source and the source of Docker `latest`;
- `v1-legacy`: archived source of the original Docker wrapper;
- `v2`: temporary migration branch, retained until the promotion is verified.

Docker tags are published automatically by GitHub Actions:

- a push to `main` publishes `latest` and a commit SHA tag;
- a tag such as `v0.2.1` publishes `0.2.1`, `0.2`, and a commit SHA tag.

Patch release procedure:

```bash
npm version patch --no-git-tag-version
npm test
npm run build
git add package.json package-lock.json
git commit -m "chore: release 0.2.1"
git tag -a v0.2.1 -m "Release 0.2.1"
git push origin main v0.2.1
```

Replace `patch` with `minor` when intentionally starting a new minor line.
