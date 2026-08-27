# Auth emails

Reference copies of the Supabase auth email templates, kept here for version control.

**These files change nothing on their own.** The live templates are edited in the Supabase
dashboard under **Authentication, then Emails** (the "Email Templates" page). Editing a file
here has no effect until its contents are pasted into the matching template there.

| File | Supabase template | Variables used |
|---|---|---|
| `confirm-signup.html` | Confirm signup | `{{ .ConfirmationURL }}` |
| `magic-link.html` | Magic Link | `{{ .ConfirmationURL }}` |
| `reset-password.html` | Reset Password | `{{ .ConfirmationURL }}` |
| `change-email.html` | Change Email Address | `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .NewEmail }}` |

The `.txt` file beside each template is its plain text equivalent. Supabase's dashboard accepts
one body per template and sends it as HTML, so the text versions are the wording of record for
any provider that takes a text part, and a safe fallback if a template is ever sent as text.

Each template is generated from one shell (tables for layout, inline styles, system font
stack, no images, no web fonts, no external assets) with the `color-scheme` and
`supported-color-schemes` meta tags, a `prefers-color-scheme: dark` block for Apple Mail and
iOS Mail, `[data-ogsc]` overrides for Outlook.com, and a VML button for Outlook on Windows.
Paper and ink swap cleanly under Gmail's automatic inversion; the red bar and the red button
stay red.

Subject lines are set in the same dashboard screen. Suggested:

- Confirm signup: `Confirm your email for Rentletter`
- Magic Link: `Your Rentletter sign in link`
- Reset Password: `Set a new Rentletter password`
- Change Email Address: `Confirm your new Rentletter email`
