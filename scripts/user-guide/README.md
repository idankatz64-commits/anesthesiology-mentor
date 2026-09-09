# Hebrew user guide

`src/content/userGuide.he.json` is the shared source for the application and PDF.
It contains product instructions only, no resident data or medical questions.

On macOS, regenerate the checked-in PDF after editing that source:

```sh
swift scripts/user-guide/build.swift
```

The generator uses AppKit/CoreText for Hebrew and bidirectional text, embeds the
used fonts, and refuses a page that would overflow. Page groups are set by each
section's `page` field. Review every generated page visually before committing
`public/guides/ysnp-user-guide-he.pdf`. The app's download link serves this file
directly; it does not invoke the print dialog. Session report exports still use
printing, as stated in the guide.

Focused UI checks: `npx vitest run src/test/userGuide.test.tsx`.
