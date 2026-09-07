# Everest CRM

A lightweight, responsive customer and operations management system designed for contractor workflows.

---

## Overview

Everest CRM is a standalone, client-side web application built with vanilla web technologies. It provides end-to-end tracking for leads, client communications, active job builds, and internal tasks, with real-time cloud synchronization and offline support.

---

## Features

- **Lead Management**: Track and filter leads by source, status, and timeline.
- **Client Pipelines**: Group prospective clients across stages (financing, HOA review, scheduled work).
- **Builds & Operations**: Monitor active job sites and archive completed builds with exportable records.
- **Task & Ticket Tracking**: Assignable task boards with priority tags, status updates, and activity logs.
- **Integrated Scheduling**: Google Calendar integration for site visits and estimate consultations.
- **Real-Time Cloud Sync**: Seamless multi-device synchronization powered by Supabase with automatic offline fallback.
- **Mobile Responsive**: Optimized interface for desktop, tablet, and mobile browsers with light/dark theme toggles.

---

## Getting Started

### Local Use
Simply open `index.html` (or `crm.html`) in any modern browser (Chrome, Safari, Edge, Firefox). All data is cached locally in your browser storage.

### Web Deployment
Deploy the files to any static web host (such as GitHub Pages, Cloudflare Pages, Netlify, or Vercel). No build step, node runtime, or server configuration is required.

---

## Cloud Sync Setup (Optional)

To synchronize data in real-time across multiple team devices:

1. Create a project on [Supabase](https://supabase.com).
2. Execute `supabase_schema.sql` in the Supabase SQL editor to create the necessary tables and realtime policies.
3. Open the CRM settings modal (**Cloud Database & Sync**) and connect using your project's URL and public publishable key.

---

## File Structure

```
├── index.html            # Main CRM entry point
├── crm.html              # Core application template
├── crm.css               # Application stylesheet and theme definitions
├── crm.js                # Application logic, state, and synchronization
└── supabase_schema.sql   # Database schema and policies for cloud sync
```

---

## License & Attribution

Internal business tool developed for Everest Horizons Roofing. All rights reserved.
