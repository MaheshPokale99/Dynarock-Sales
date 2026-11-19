# Connecting `sales@dynarock.in` (Google Workspace)

This is a one-time setup. It needs someone who can sign in to the Google Workspace admin console for `dynarock.in`. It takes about 15 minutes.

## Before you start

- `sales@dynarock.in` must be a **real Workspace user with a mailbox**, not a Google Group or an alias. The Gmail API only works with real mailboxes. If it is a group today, create a user called `sales` and move the group's members to delegates or forwarding.
- Sign in to Google Cloud with your **@dynarock.in admin account**, so the project belongs to the `dynarock.in` organization. Only projects inside the organization can use an **Internal** app.

## 1. Create a Google Cloud project

1. Open <https://console.cloud.google.com> and check the organization picker shows `dynarock.in`.
2. Create a new project named **Dynarock Sales**.

## 2. Turn on the Gmail API

1. Go to **APIs & Services → Library**.
2. Search for **Gmail API**, open it and click **Enable**.

## 3. Set up the consent screen

1. Go to **Google Auth Platform** (called **OAuth consent screen** in older menus) and click **Get started**.
2. Fill in these fields:
   - **App name:** `Dynarock Sales`
   - **Support email:** your email
   - **Audience:** **Internal**. Only `@dynarock.in` accounts can use it, and Google doesn't need to review the app.
   - **Contact email:** your email
3. Under **Data access**, add the scope `https://www.googleapis.com/auth/gmail.modify`. This lets the app read, send and mark mail as read. It can't delete mail permanently.

## 4. Create the OAuth client

1. Go to **Clients → Create client**.
2. For **Application type**, choose **Web application**. For **Name**, enter `Dynarock Sales API`.
3. Under **Authorized redirect URIs**, add:
   - `http://localhost:5000/api/v1/mailbox/oauth/callback` for local development.
   - When you deploy, also add the production one, for example `https://api.sales.dynarock.in/api/v1/mailbox/oauth/callback`.
4. Click **Create**, then copy the **Client ID** and **Client secret**.

## 5. Configure the API

Generate an encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Add the values to `backend/.env`:

```bash
MAILBOX_ADDRESS=sales@dynarock.in
GOOGLE_CLIENT_ID=<client id>
GOOGLE_CLIENT_SECRET=<client secret>
ENCRYPTION_KEY=<the key from above>
# Only needed if the API isn't on http://localhost:5000:
GOOGLE_REDIRECT_URI=https://api.sales.dynarock.in/api/v1/mailbox/oauth/callback
```

Restart the API. The log should show `gmail: "sales@dynarock.in"`.

Keep `ENCRYPTION_KEY` safe and never change it. Changing it makes the saved connection unreadable, and you would have to connect again.

## 6. Connect the mailbox in the app

1. Sign in to Dynarock Sales as an **admin**.
2. Go to **Settings → Mailbox → Connect Gmail**.
3. Choose the **`sales@dynarock.in`** account and click **Allow**.
4. You land back on Settings with **Connected**. New mail is checked every minute, and **Check now** checks immediately.

If you pick a different Google account, the app refuses it and tells you which account to use.

## 7. Workspace admin checks (admin.google.com)

| Where | What to check |
| --- | --- |
| Security → Access and data control → API controls | **Trust internal, domain-owned apps** is on. Otherwise Google may block the sign-in. |
| Apps → Google Workspace → Gmail → Authenticate email | DKIM is generated and turned on for `dynarock.in`. |
| Your DNS provider | SPF (`v=spf1 include:_spf.google.com ~all`) and a DMARC record exist. Without them, sales emails are more likely to land in spam. |

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Gmail isn't set up on the server yet" | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` or `ENCRYPTION_KEY` is missing. Set them and restart the API. |
| Google shows `redirect_uri_mismatch` | The redirect URI on the OAuth client must match `GOOGLE_REDIRECT_URI` exactly, including `http`/`https` and the port. |
| Google shows "access blocked" / `admin_policy_enforced` | Turn on **Trust internal, domain-owned apps** (step 7), or mark this app as trusted under **API controls → Manage third-party app access**. |
| Settings shows "Needs attention: access was revoked or expired" | Someone removed the app's access, or the `sales@` password was reset. Click **Reconnect Gmail**. |
| Mail sent from the Gmail website doesn't show who sent it | That's expected. Only emails sent from the app record the salesperson. Gmail-direct emails show as "Sent from Gmail". |
