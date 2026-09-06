# Everest CRM — Setup Guide

## Step 1 — Open the CRM

Open `crm.html` in any modern browser (Chrome, Edge, Safari). You can open it as a local file or host it on your website server alongside `index.html`.

---

## Step 2 — First Login

Use these default credentials:

| Username | Password | Role |
|---|---|---|
| `admin` | `Everest@Admin1` | Full access including Vault & all data |
| `KN` | `Everest@KN1` | All tabs except Vault |
| `AK` | `Everest@AK1` | All tabs except Vault |

> **Change these passwords** after your first login (see Step 5 below).

---

## Step 3 — Set Up Google Sheets Backend (Optional but Recommended)

Data is saved locally in the browser by default. To sync across devices (so the whole team shares one dataset), connect a Google Sheet.

### 3a. Create the Google Sheet

1. Go to sheets.google.com → New spreadsheet
2. Rename it: `Everest CRM Data`
3. Create 5 tabs: `leads`, `clients`, `builds`, `pastBuilds`, `tickets`
4. Add headers to each tab (see below):

**leads tab Row 1:** id | name | phone | email | address | source | status | notes | dateAdded | addedBy | archived
**clients tab Row 1:** id | name | phone | email | address | status | estValue | notes | lastContact | addedBy | promotedFrom
**builds tab Row 1:** id | clientName | address | material | status | startDate | estCompletion | notes | crew | finalValue
**pastBuilds tab Row 1:** id | clientName | address | material | startDate | endDate | finalValue | notes
**tickets tab Row 1:** id | title | description | status | priority | assignee | dueDate | tags | createdAt | updatedAt | createdBy

### 3b. Create the Apps Script

1. In your Google Sheet: Extensions → Apps Script
2. Delete default code, paste this:

```javascript
const SHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const tab = ss.getSheetByName(data.tab);
  if (!tab) return respond({ error: 'Tab not found' });
  if (data.action === 'sync') {
    const rows = data.data;
    tab.clearContents();
    if (rows.length > 0) {
      const headers = Object.keys(rows[0]);
      tab.appendRow(headers);
      rows.forEach(row => tab.appendRow(headers.map(h => row[h] ?? '')));
    }
    return respond({ success: true });
  }
  return respond({ error: 'Unknown action' });
}
function doGet(e) {
  const data = e.parameter;
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const tab = ss.getSheetByName(data.tab);
  if (!tab) return respond({ error: 'Tab not found' });
  return respond(tab.getDataRange().getValues());
}
function respond(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
```

3. Save → Deploy → New Deployment
4. Type: Web App | Execute as: Me | Access: Anyone
5. Deploy → copy the Web App URL

### 3c. Paste the URL into crm.js

Find line 7 in crm.js and replace:
```js
GOOGLE_SHEETS_URL: 'PASTE_YOUR_WEB_APP_URL_HERE',
```

---

## Step 4 — Connect Google Calendar

1. Go to calendar.google.com → Settings (gear icon)
2. Click your calendar name in left panel → Integrate calendar
3. Copy the embed URL from inside `src="..."` in the embed code
4. In the CRM → Calendar tab → paste URL → Save Calendar URL

---

## Step 5 — Change Default Passwords

Open `crm.js`, find the `USERS` array (~line 25), change `defaultPassword` values:

```js
{ id: 'admin', defaultPassword: 'YOUR_NEW_ADMIN_PASSWORD', ... },
{ id: 'KN',    defaultPassword: 'YOUR_NEW_KN_PASSWORD',    ... },
{ id: 'AK',    defaultPassword: 'YOUR_NEW_AK_PASSWORD',    ... },
```

To add a new team member, add:
```js
{ id: 'XX', displayName: 'Name', initials: 'XX', role: 'sales', defaultPassword: 'Password1!', passwordHash: null },
```

---

## Step 6 — Set Up the Password Vault (Admin only)

1. Log in as admin → click Vault in sidebar
2. You'll see 4 pre-seeded accounts with "⚠️ Add password" placeholder
3. Click Edit (pencil) on each card → enter the password → Save
4. Password is encrypted with AES-256-GCM immediately — never stored in plaintext

> NOTE: If you change the admin password in crm.js, you will need to re-enter all vault passwords.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Wrong password | Check defaultPassword in crm.js is correct |
| Vault shows "Error decrypting" | Admin password was changed — re-enter vault entries |
| Calendar not loading | Make sure embed URL is public |
| Data not syncing to Sheets | Verify Apps Script URL is correct and deployed as "Anyone" |
| Sales user sees Vault tab | Clear browser cache and reload |

---

## Files Reference

| File | Purpose |
|---|---|
| `crm.html` | The CRM application (open this in browser) |
| `crm.css` | Styles |
| `crm.js` | Logic — edit for passwords, Sheets URL |
| `SETUP.md` | This guide |
