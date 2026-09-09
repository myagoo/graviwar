# Issue tracker: Local Markdown

Issues and specs live in gitignored `.scratch/`.

- Feature directory: `.scratch/<feature-slug>/`.
- Spec: `<feature-directory>/spec.md`.
- Tickets: `<feature-directory>/issues/<NN>-<slug>.md`,
  numbered from 01, one ticket per file.
- Record triage state in a `Status:` line near the top.
  Use the values in `triage-labels.md`.
- Append conversation under `## Comments`.

When instructed to publish to the issue tracker, create the
appropriate local Markdown file. When fetching a ticket, read
the referenced file; resolve ticket numbers within their feature.
