# Contributing

Contributions are welcome through focused issues and pull requests.

## Before opening a pull request

1. Target the `main` branch and keep the change limited to one subject.
2. Do not commit `.env`, credentials, private GLPI data or files from `test/`.
3. Run `npm test` and `npm run build`.
4. Add or update public tests for behavioural changes.
5. Update the relevant documentation and version metadata when required.

Write operations must retain explicit safety annotations, least-privilege
behaviour and the API routing guarantees documented in `docs/`.

By contributing, you agree that your contribution is licensed under the MIT
licence used by this project.
