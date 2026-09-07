/* crm.js */

/* ==========================================================================
   1. CONFIG & GLOBALS
   ========================================================================== */
const CONFIG = {
  SUPABASE_URL: 'https://tlsyjwcgjlypopxtnaig.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_TtFpqZ1-Lhn9XuJlMjpI4Q_ceheITrU',
  GOOGLE_SHEETS_URL: '',        // Paste your Apps Script Web App URL here (optional)
  CALENDAR_EMBED_URL: '',       // Paste your Google Calendar embed URL here (optional)
  COMPANY_NAME: 'Everest Horizons Roofing',
  NOTIFY_EMAIL: 'everesthorizonsroofing@gmail.com',
  // Email notifications use formsubmit.co — already active, no setup needed.
};

const STORAGE_KEYS = {
  leads:          'crm_leads',
  clients:        'crm_clients',
  builds:         'crm_builds',
  pastBuilds:     'crm_pastBuilds',
  tickets:        'crm_tickets',
  vault:          'crm_vault_encrypted',
  calendarUrl:    'crm_calendar_url',
  websiteLeads:   'crm_website_incoming', // bridge key — written by index.html form
};

/* ==========================================================================
   2. AUTH — single login
   ========================================================================== */
const USERS = [
  { id: 'epool', displayName: 'Everest', initials: 'EH', defaultPassword: 'poole', passwordHash: null },
];

let currentUser = null;

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function initAuth() {
  for (const user of USERS) {
    if (user.defaultPassword) {
      user.passwordHash = await hashPassword(user.defaultPassword);
      delete user.defaultPassword;
    }
  }
}

async function login(username, password) {
  const hash = await hashPassword(password);
  const user = USERS.find(u => u.id.toLowerCase() === username.toLowerCase() && u.passwordHash === hash);
  if (!user) return false;
  currentUser = user;
  sessionStorage.setItem('crm_user', JSON.stringify({ id: user.id, displayName: user.displayName, initials: user.initials }));
  return true;
}

function logout() {
  currentUser = null;
  sessionStorage.removeItem('crm_user');
  document.getElementById('loginOverlay').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  document.getElementById('loginForm').reset();
}

function restoreSession() {
  const saved = sessionStorage.getItem('crm_user');
  if (saved) {
    currentUser = JSON.parse(saved);
    return true;
  }
  return false;
}



/* ==========================================================================
   3. STORAGE & SUPABASE CLOUD SYNC
   ========================================================================== */
let supabaseClient = null;
let realtimeChannel = null;

function getSupabaseCredentials() {
  const url = localStorage.getItem('crm_supabase_url') || CONFIG.SUPABASE_URL || '';
  const key = localStorage.getItem('crm_supabase_key') || CONFIG.SUPABASE_ANON_KEY || '';
  return { url: url.trim(), key: key.trim() };
}

function updateCloudIndicator(status, text) {
  const ind = document.getElementById('cloudIndicator');
  const detail = document.getElementById('cloudStatusDetail');
  const textEl = document.getElementById('cloudStatusText');
  const connectedView = document.getElementById('cloudConnectedView');
  const configFields = document.getElementById('cloudConfigFields');

  [ind, detail].forEach(el => {
    if (!el) return;
    el.classList.remove('connected', 'syncing', 'offline', 'error');
    el.classList.add(status);
  });

  if (ind) {
    const label = ind.querySelector('.cloud-text');
    if (label) label.textContent = text;
  }
  if (textEl) textEl.textContent = text;

  // When connected, show the clean Connected badge and hide raw credential inputs
  if (status === 'connected') {
    if (connectedView) connectedView.style.display = 'block';
    if (configFields) configFields.style.display = 'none';
  } else {
    if (connectedView) connectedView.style.display = 'none';
    if (configFields) configFields.style.display = 'flex';
  }
}

function mapItemToDb(tableName, item) {
  if (tableName === 'leads') {
    return {
      id: item.id,
      name: item.name,
      phone: item.phone || '',
      email: item.email || '',
      address: item.address || '',
      source: item.source || 'Website',
      status: item.status || 'New',
      date_added: item.dateAdded || item.date_added || '',
      notes: item.notes || '',
      archived: !!item.archived
    };
  }
  if (tableName === 'clients') {
    return {
      id: item.id,
      name: item.name,
      phone: item.phone || '',
      email: item.email || '',
      address: item.address || '',
      status: item.status || 'Waiting - Other',
      est_value: item.estValue || item.est_value || '',
      notes: item.notes || '',
      last_contact: item.lastContact || item.last_contact || '',
      added_by: item.addedBy || '',
      promoted_from: item.promotedFrom || ''
    };
  }
  if (tableName === 'builds') {
    return {
      id: item.id,
      client_name: item.clientName || item.client_name || '',
      address: item.address || '',
      material: item.material || '',
      status: item.status || 'Just Started',
      start_date: item.startDate || item.start_date || '',
      est_completion: item.estCompletion || item.est_completion || '',
      crew: item.crew || '',
      notes: item.notes || '',
      final_value: item.finalValue || item.final_value || ''
    };
  }
  if (tableName === 'past_builds') {
    return {
      id: item.id,
      client_name: item.clientName || item.client_name || '',
      address: item.address || '',
      material: item.material || '',
      start_date: item.startDate || item.start_date || '',
      end_date: item.endDate || item.end_date || '',
      final_value: item.finalValue || item.final_value || '',
      notes: item.notes || ''
    };
  }
  if (tableName === 'tickets') {
    return {
      id: item.id,
      description: item.description || item.title || '',
      status: item.status || 'Pending',
      assignee: item.assignee || 'Unassigned'
    };
  }
  return item;
}

function mapDbToItem(tableName, row) {
  if (tableName === 'leads') {
    return {
      id: row.id,
      name: row.name,
      phone: row.phone || '',
      email: row.email || '',
      address: row.address || '',
      source: row.source || 'Website',
      status: row.status || 'New',
      dateAdded: row.date_added || row.created_at,
      notes: row.notes || '',
      archived: !!row.archived
    };
  }
  if (tableName === 'clients') {
    return {
      id: row.id,
      name: row.name,
      phone: row.phone || '',
      email: row.email || '',
      address: row.address || '',
      status: row.status || 'Waiting - Other',
      estValue: row.est_value || '',
      notes: row.notes || '',
      lastContact: row.last_contact || '',
      addedBy: row.added_by || '',
      promotedFrom: row.promoted_from || ''
    };
  }
  if (tableName === 'builds') {
    return {
      id: row.id,
      clientName: row.client_name,
      address: row.address || '',
      material: row.material || '',
      status: row.status || 'Just Started',
      startDate: row.start_date || '',
      estCompletion: row.est_completion || '',
      crew: row.crew || '',
      notes: row.notes || '',
      finalValue: row.final_value || ''
    };
  }
  if (tableName === 'past_builds') {
    return {
      id: row.id,
      clientName: row.client_name,
      address: row.address || '',
      material: row.material || '',
      startDate: row.start_date || '',
      endDate: row.end_date || '',
      finalValue: row.final_value || '',
      notes: row.notes || ''
    };
  }
  if (tableName === 'tickets') {
    return {
      id: row.id,
      description: row.description,
      status: row.status || 'Pending',
      assignee: row.assignee || 'Unassigned',
      createdAt: row.created_at
    };
  }
  return row;
}

async function syncTableToSupabase(key, data) {
  if (!supabaseClient) return;
  const tableMap = {
    leads: 'leads',
    clients: 'clients',
    builds: 'builds',
    pastBuilds: 'past_builds',
    tickets: 'tickets'
  };
  const tableName = tableMap[key];
  if (!tableName) return;

  try {
    updateCloudIndicator('syncing', 'Syncing...');
    const dbRows = data.map(item => mapItemToDb(tableName, item));
    if (dbRows.length > 0) {
      const { error: upErr } = await supabaseClient.from(tableName).upsert(dbRows);
      if (upErr) console.warn('Supabase upsert warning:', upErr);
    }
    updateCloudIndicator('connected', 'Cloud Synced');
  } catch (err) {
    console.warn('Supabase sync error for ' + tableName, err);
    updateCloudIndicator('error', 'Sync Error');
  }
}

async function deleteFromSupabase(key, idOrIds) {
  if (!supabaseClient) return;
  const tableMap = {
    leads: 'leads',
    clients: 'clients',
    builds: 'builds',
    pastBuilds: 'past_builds',
    tickets: 'tickets'
  };
  const tableName = tableMap[key];
  if (!tableName) return;

  try {
    if (Array.isArray(idOrIds)) {
      if (idOrIds.length > 0) {
        await supabaseClient.from(tableName).delete().in('id', idOrIds);
      }
    } else if (idOrIds) {
      await supabaseClient.from(tableName).delete().eq('id', idOrIds);
    }
  } catch (err) {
    console.warn(`Error deleting from Supabase ${tableName}:`, err);
  }
}

async function pullTableFromCloud(tableName) {
  if (!supabaseClient) return;
  try {
    let query = supabaseClient.from(tableName).select('*');
    if (tableName === 'tickets' || tableName === 'leads') {
      query = query.order('created_at', { ascending: false });
    }
    const { data, error } = await query;
    if (error || !data) return;

    const reverseMap = {
      leads: 'leads',
      clients: 'clients',
      builds: 'builds',
      past_builds: 'pastBuilds',
      tickets: 'tickets'
    };
    const storageKey = reverseMap[tableName];
    if (!storageKey) return;

    const mapped = data.map(r => mapDbToItem(tableName, r));
    setData(storageKey, mapped, false);

    if (storageKey === 'leads') renderLeads();
    else if (storageKey === 'clients') renderClients();
    else if (storageKey === 'builds') renderBuilds();
    else if (storageKey === 'pastBuilds') renderPastBuilds();
    else if (storageKey === 'tickets') renderTickets();
  } catch (err) {
    console.warn('Error pulling table ' + tableName, err);
  }
}

async function pullAllFromCloud() {
  if (!supabaseClient) return;
  updateCloudIndicator('syncing', 'Syncing Cloud...');
  const tables = ['tickets', 'leads', 'clients', 'builds', 'past_builds'];
  for (const t of tables) {
    await pullTableFromCloud(t);
  }
  localStorage.setItem('crm_tickets_seeded', 'true');
  localStorage.setItem('crm_leads_seeded', 'true');
  updateCloudIndicator('connected', 'Cloud Connected');
}

function setupRealtimeSubscriptions() {
  if (!supabaseClient) return;
  if (realtimeChannel) {
    supabaseClient.removeChannel(realtimeChannel);
  }

  realtimeChannel = supabaseClient.channel('crm-realtime-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => pullTableFromCloud('leads'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, () => pullTableFromCloud('clients'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'builds' }, () => pullTableFromCloud('builds'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'past_builds' }, () => pullTableFromCloud('past_builds'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => pullTableFromCloud('tickets'))
    .subscribe();
}

async function initSupabase(showFeedback = false) {
  const { url, key } = getSupabaseCredentials();
  const urlInput = document.getElementById('cfgSupabaseUrl');
  const keyInput = document.getElementById('cfgSupabaseKey');
  if (urlInput && url) urlInput.value = url;
  if (keyInput && key) keyInput.value = key;

  if (!url || !key || !window.supabase) {
    updateCloudIndicator('offline', 'Local Mode');
    return false;
  }

  try {
    updateCloudIndicator('syncing', 'Connecting...');
    supabaseClient = window.supabase.createClient(url, key);
    
    // Test connection
    const { error } = await supabaseClient.from('tickets').select('id').limit(1);
    if (error) throw error;

    updateCloudIndicator('connected', 'Cloud Connected');
    setupRealtimeSubscriptions();
    await pullAllFromCloud();

    if (showFeedback) showToast('Connected to Supabase! Live sync active.');
    return true;
  } catch (err) {
    console.error('Supabase connection failed:', err);
    updateCloudIndicator('error', 'Cloud Error');
    if (showFeedback) showToast('Supabase connection error: ' + (err.message || 'Check URL/Key'), 'error');
    return false;
  }
}

function getData(key) {
  const raw = localStorage.getItem(STORAGE_KEYS[key]);
  return raw ? JSON.parse(raw) : [];
}

function setData(key, data, syncCloud = true) {
  localStorage.setItem(STORAGE_KEYS[key], JSON.stringify(data));
  syncToSheets(key, data);
  if (syncCloud && supabaseClient) {
    syncTableToSupabase(key, data);
  }
}

async function syncToSheets(key, data) {
  if (!CONFIG.GOOGLE_SHEETS_URL) return;
  try {
    await fetch(CONFIG.GOOGLE_SHEETS_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'sync', tab: key, data }),
    });
  } catch (e) {}
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function getDisplayDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleDateString();
}

function formatPhoneNumber(val) {
  if (!val) return '';
  const digits = String(val).replace(/\D/g, '').substring(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

function formatNotes(text, maxLen = 35) {
  if (!text) return '-';
  const clean = String(text).trim().replace(/\s+/g, ' ');
  if (!clean) return '-';
  const escaped = clean.replace(/"/g, '&quot;');
  if (clean.length <= maxLen) {
    return `<span class="table-note" title="${escaped}">${clean}</span>`;
  }
  return `<span class="table-note" title="${escaped}">${clean.substring(0, maxLen)}...</span>`;
}

// Global auto-format phone numbers as XXX-XXX-XXXX on input anywhere
document.addEventListener('input', function(e) {
  const target = e.target;
  if (!target || !target.tagName || target.tagName.toLowerCase() !== 'input') return;
  const idOrName = ((target.id || '') + ' ' + (target.name || '')).toLowerCase();
  const isPhone = target.type === 'tel' || idOrName.includes('phone');
  if (isPhone) {
    const formatted = formatPhoneNumber(target.value);
    if (target.value !== formatted) {
      target.value = formatted;
    }
  }
});

/* ==========================================================================
   EMAIL NOTIFICATIONS (formsubmit.co)
   Uses the same service already powering the website contact form.
   Zero setup required — everesthorizonsroofing@gmail.com is already verified.

   Events that trigger an email:
     • New lead added manually in the CRM
     • Website form lead auto-imported into CRM
     • Lead promoted to Potential Client
     • New build started
     • Build marked Completed
     • New Critical or High ticket created
     • Ticket marked Done
   ========================================================================== */

/**
 * sendNotification(type, payload)
 * Fire-and-forget — CRM keeps working even if the email call fails.
 */
async function sendNotification(type, payload) {
  const now = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' });
  const addedBy = currentUser ? currentUser.displayName : 'Website Form';

  const SUBJECTS = {
    new_lead:        'New Lead Added — Everest CRM',
    website_lead:    'New Website Lead — Action Required',
    lead_promoted:   'Lead Promoted to Client — Everest CRM',
    new_build:       'New Build Started — Everest CRM',
    build_completed: 'Build Completed — Everest CRM',
    new_ticket:      'New Ticket Created — Everest CRM',
    ticket_done:     'Ticket Closed — Everest CRM',
  };

  let message = '';
  switch (type) {
    case 'new_lead':
      message = `New lead added to the CRM.\n\nName: ${payload.name}\nPhone: ${payload.phone}\nEmail: ${payload.email || 'N/A'}\nAddress: ${payload.address || 'N/A'}\nSource: ${payload.source}\nStatus: ${payload.status}\nNotes: ${payload.notes || 'None'}\nAdded by: ${addedBy} on ${now}`;
      break;
    case 'website_lead':
      message = `A visitor submitted the inspection form on your website.\n\nName: ${payload.name}\nPhone: ${payload.phone}\nEmail: ${payload.email || 'N/A'}\nAddress: ${payload.address || 'N/A'}\nNotes: ${payload.notes || 'None'}\nSubmitted: ${now}\n\nThis lead has been automatically added to your CRM Leads board.`;
      break;
    case 'lead_promoted':
      message = `Lead promoted to Potential Client.\n\nName: ${payload.name}\nPhone: ${payload.phone}\nAddress: ${payload.address || 'N/A'}\nPromoted by: ${addedBy} on ${now}`;
      break;
    case 'new_build':
      message = `New active build added.\n\nClient: ${payload.clientName}\nAddress: ${payload.address}\nMaterial: ${payload.material || 'N/A'}\nStart Date: ${payload.startDate || 'N/A'}\nEst. Completion: ${payload.estCompletion || 'N/A'}\nAdded by: ${addedBy} on ${now}`;
      break;
    case 'build_completed':
      message = `Build marked as Completed.\n\nClient: ${payload.clientName}\nAddress: ${payload.address}\nFinal Value: ${payload.finalValue ? '$' + payload.finalValue : 'N/A'}\nCompleted: ${now}`;
      break;
    case 'new_ticket':
      message = `New ticket created.\n\nTitle: ${payload.title}\nPriority: ${payload.priority}\nAssignee: ${payload.assignee}\nDescription: ${payload.description || 'None'}\nCreated by: ${addedBy} on ${now}`;
      break;
    case 'ticket_done':
      message = `Ticket marked as Done.\n\nTitle: ${payload.title}\nAssignee: ${payload.assignee}\nClosed by: ${addedBy} on ${now}`;
      break;
    default:
      message = JSON.stringify(payload);
  }

  try {
    await fetch('https://formsubmit.co/ajax/everesthorizonsroofing@gmail.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        _subject: SUBJECTS[type] || 'Everest CRM Notification',
        name: CONFIG.COMPANY_NAME,
        message: message,
        _template: 'table',
      }),
    });
    console.log(`[CRM] Notification sent: ${type}`);
  } catch (err) {
    // Non-fatal — CRM keeps working even if email fails
    console.warn('[CRM] Notification failed:', err);
  }
}

// No init needed for formsubmit.co
function initEmailJS() {}

/* ==========================================================================
   WEBSITE LEAD BRIDGE
   When a visitor submits the inspection form on index.html, the lead is
   written to localStorage under key 'crm_website_incoming' (an array).
   When a CRM user opens the Leads section, any pending website leads are
   auto-imported, an email notification fires, and the queue is cleared.
   ========================================================================== */

function importWebsiteLeads() {
  const raw = localStorage.getItem(STORAGE_KEYS.websiteLeads);
  if (!raw) return;

  let incoming;
  try { incoming = JSON.parse(raw); } catch { return; }
  if (!Array.isArray(incoming) || incoming.length === 0) return;

  localStorage.removeItem(STORAGE_KEYS.websiteLeads);

  const leads = getData('leads');
  incoming.forEach(lead => {
    const newLead = {
      id:        generateId(),
      name:      lead.name      || 'Unknown',
      phone:     lead.phone     || '',
      email:     lead.email     || '',
      address:   lead.address   || '',
      source:    'Website',
      status:    'New',
      notes:     lead.notes     || '',
      dateAdded: lead.submittedAt || new Date().toISOString(),
      addedBy:   'Website Form',
      archived:  false,
    };
    leads.push(newLead);
    sendNotification('website_lead', newLead);
  });

  setData('leads', leads);
  renderLeads();
  updateWebsiteLeadsBadge(0);

  const count = incoming.length;
  showToast(`${count} new website lead${count > 1 ? 's' : ''} imported!`, 'success');
}

function updateWebsiteLeadsBadge(count) {
  const badge = document.getElementById('websiteLeadsBadge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'inline-flex';
  } else {
    badge.style.display = 'none';
  }
}

function checkWebsiteLeadsBadge() {
  const raw = localStorage.getItem(STORAGE_KEYS.websiteLeads);
  if (!raw) { updateWebsiteLeadsBadge(0); return; }
  try {
    const incoming = JSON.parse(raw);
    updateWebsiteLeadsBadge(Array.isArray(incoming) ? incoming.length : 0);
  } catch { updateWebsiteLeadsBadge(0); }
}


/* ==========================================================================
   4. VAULT (AES-256-GCM)
   ========================================================================== */
const VAULT_SALT = 'EverestCRMVaultSalt2024';

async function deriveVaultKey(password) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(VAULT_SALT), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptPassword(plaintext) {
  if (!vaultKey) throw new Error('No vault key');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, vaultKey, enc.encode(plaintext));
  const toB64 = arr => btoa(String.fromCharCode(...new Uint8Array(arr)));
  return `${toB64(iv)}:${toB64(ciphertext)}`;
}

async function decryptPassword(encrypted) {
  if (!vaultKey) throw new Error('No vault key');
  if (!encrypted) return '';
  try {
    const [ivB64, ctB64] = encrypted.split(':');
    const fromB64 = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const iv = fromB64(ivB64);
    const ciphertext = fromB64(ctB64);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, vaultKey, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch(e) {
    console.error(e);
    return 'ERROR_DECRYPT';
  }
}

const VAULT_PRESEEDED = [
  { service: 'Gmail', icon: '📧', username: 'everesthorizonsroofing@gmail.com', email: 'everesthorizonsroofing@gmail.com', url: 'https://mail.google.com', notes: 'Main business email', passwordEncrypted: null },
  { service: 'Outlook (Pool)', icon: '📮', username: 'info@everestgreenhorizons.com', email: 'info@everestgreenhorizons.com', url: 'https://outlook.com', notes: 'Pool business email', passwordEncrypted: null },
  { service: 'Instagram', icon: '📸', username: 'everestgreenhorizons', email: '', url: 'https://instagram.com', notes: '@everestgreenhorizons', passwordEncrypted: null },
  { service: 'Facebook', icon: '👤', username: '817-403-8418', email: '', url: 'https://facebook.com', notes: 'Login with phone number', passwordEncrypted: null },
];

function getVaultEntries() {
  const raw = localStorage.getItem(STORAGE_KEYS.vault);
  if (!raw) {
    const entries = VAULT_PRESEEDED.map(e => ({ ...e, id: generateId(), addedAt: new Date().toISOString() }));
    setData('vault', entries);
    return entries;
  }
  return JSON.parse(raw);
}

/* ==========================================================================
   5. BULK SELECTION & ACTION MANAGER
   ========================================================================== */
const SELECTED_ITEMS = {
  leads: new Set(),
  clients: new Set(),
  builds: new Set(),
  pastBuilds: new Set(),
  tickets: new Set()
};

function updateBulkBar(entity) {
  const set = SELECTED_ITEMS[entity];
  const bar = document.getElementById(`bulkBar-${entity}`);
  if (bar) {
    if (set.size > 0) {
      bar.style.display = 'inline-flex';
      const countEl = bar.querySelector('.bulk-count');
      if (countEl) countEl.innerText = `${set.size} selected`;
    } else {
      bar.style.display = 'none';
    }
  }

  // Update header checkbox
  const allCb = document.querySelector(`.cb-select-all[data-entity="${entity}"]`);
  const rowCbs = document.querySelectorAll(`.cb-row[data-entity="${entity}"]`);
  if (allCb && rowCbs.length > 0) {
    const allChecked = Array.from(rowCbs).every(cb => cb.checked);
    allCb.checked = allChecked;
    allCb.indeterminate = !allChecked && set.size > 0;
  } else if (allCb) {
    allCb.checked = false;
    allCb.indeterminate = false;
  }
}

window.toggleSelectAll = function(entity, isCheckedOrEvent) {
  // If any items are currently selected, clicking the top tick deselects all.
  // If no items are selected, clicking it selects all.
  const hasSelected = SELECTED_ITEMS[entity].size > 0;
  const targetCheck = (typeof isCheckedOrEvent === 'boolean') ? isCheckedOrEvent : !hasSelected;

  const allCb = document.querySelector(`.cb-select-all[data-entity="${entity}"]`);
  if (allCb) {
    allCb.checked = targetCheck;
    allCb.indeterminate = false;
  }

  const rowCbs = document.querySelectorAll(`.cb-row[data-entity="${entity}"]`);
  rowCbs.forEach(cb => {
    cb.checked = targetCheck;
    const id = cb.dataset.id;
    const tr = cb.closest('tr');
    if (targetCheck) {
      SELECTED_ITEMS[entity].add(id);
      tr?.classList.add('row-selected');
    } else {
      SELECTED_ITEMS[entity].delete(id);
      tr?.classList.remove('row-selected');
    }
  });
  updateBulkBar(entity);
};

window.onRowSelectChange = function(entity) {
  const set = SELECTED_ITEMS[entity];
  set.clear();
  const rowCbs = document.querySelectorAll(`.cb-row[data-entity="${entity}"]`);
  rowCbs.forEach(cb => {
    const tr = cb.closest('tr');
    if (cb.checked) {
      set.add(cb.dataset.id);
      tr?.classList.add('row-selected');
    } else {
      tr?.classList.remove('row-selected');
    }
  });
  updateBulkBar(entity);
};

window.deselectAll = function(entity) {
  SELECTED_ITEMS[entity].clear();
  const rowCbs = document.querySelectorAll(`.cb-row[data-entity="${entity}"]`);
  rowCbs.forEach(cb => {
    cb.checked = false;
    cb.closest('tr')?.classList.remove('row-selected');
  });
  const allCb = document.querySelector(`.cb-select-all[data-entity="${entity}"]`);
  if (allCb) {
    allCb.checked = false;
    allCb.indeterminate = false;
  }
  updateBulkBar(entity);
};

window.bulkDelete = function(entity) {
  const set = SELECTED_ITEMS[entity];
  if (set.size === 0) return;
  const count = set.size;
  if (!confirm(`Are you sure you want to delete ${count} selected item(s)?`)) return;

  const storageKey = entity;
  const idsToDelete = Array.from(set);
  let items = getData(storageKey);
  items = items.filter(item => !set.has(item.id));
  setData(storageKey, items, false);
  deleteFromSupabase(storageKey, idsToDelete);
  set.clear();
  updateBulkBar(entity);

  if (entity === 'leads') renderLeads();
  else if (entity === 'clients') renderClients();
  else if (entity === 'builds') renderBuilds();
  else if (entity === 'pastBuilds') renderPastBuilds();
  else if (entity === 'tickets') renderTickets();

  showToast(`${count} item(s) deleted`);
};

/* ==========================================================================
   6. RENDER & CRUD LOGIC
   ========================================================================== */

// --- LEADS ---
const INITIAL_LEADS = [
  {
    name: 'Reynier Torres',
    phone: '786-803-1254',
    email: '',
    address: '',
    source: 'Instagram',
    status: 'New',
    notes: 'We need send design to the client and follow up',
    dateAdded: '2026-09-06T12:00:00.000Z'
  },
  {
    name: 'Matthew Stellfox',
    phone: '',
    email: '',
    address: '',
    source: 'Messenger',
    status: 'New',
    notes: 'Interested in $52k pool - follow up',
    dateAdded: '2026-09-06T12:00:00.000Z'
  },
  {
    name: 'Joseph Brent Satterfield',
    phone: '',
    email: '',
    address: '',
    source: 'Messenger',
    status: 'New',
    notes: 'Waiting for their reply',
    dateAdded: '2026-09-06T12:00:00.000Z'
  },
  {
    name: 'Kristy Morris Page',
    phone: '',
    email: '',
    address: '',
    source: 'Messenger',
    status: 'New',
    notes: 'Client wants design - Possible Feb build',
    dateAdded: '2026-09-06T12:00:00.000Z'
  },
  {
    name: 'Keren Stallin',
    phone: '469-888-3065',
    email: '',
    address: '',
    source: 'Messenger',
    status: 'New',
    notes: 'Consultation done - follow up',
    dateAdded: '2026-09-06T12:00:00.000Z'
  },
  {
    name: 'Kay West Parrish',
    phone: '817-343-0311',
    email: '',
    address: '',
    source: 'Messenger',
    status: 'New',
    notes: 'Consultation done, survey received',
    dateAdded: '2026-09-06T12:00:00.000Z'
  },
  {
    name: 'Gabriel Sellan',
    phone: '',
    email: '',
    address: '',
    source: 'Instagram',
    status: 'New',
    notes: 'Asked for survey - waiting Follow up',
    dateAdded: '2026-09-06T12:00:00.000Z'
  }
];

function seedInitialLeads(force = false) {
  const existing = getData('leads');
  if (existing.length === 0 || force) {
    const leads = INITIAL_LEADS.map(l => ({
      id: generateId(),
      name: l.name,
      phone: l.phone,
      email: l.email || '',
      address: l.address || '',
      source: l.source,
      status: l.status,
      dateAdded: l.dateAdded || new Date().toISOString(),
      notes: l.notes,
      archived: false
    }));
    setData('leads', leads, false);
    localStorage.setItem('crm_leads_seeded', 'true');
  }
}

function renderLeads() {
  const leads = getData('leads').filter(l => !l.archived);
  const srcFilter = document.getElementById('filterLeadSource').value;
  const statFilter = document.getElementById('filterLeadStatus').value;
  const search = document.getElementById('searchLeads').value.toLowerCase();
  
  const tbody = document.querySelector('#leadsTable tbody');
  tbody.innerHTML = '';
  
  let filtered = leads.filter(l => {
    if (srcFilter !== 'All' && l.source !== srcFilter) return false;
    if (statFilter !== 'All' && l.status !== statFilter) return false;
    if (search && !l.name.toLowerCase().includes(search) && !l.phone.includes(search)) return false;
    return true;
  });

  filtered.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;">No leads found.</td></tr>`;
    updateBulkBar('leads');
    return;
  }

  filtered.forEach(lead => {
    const tr = document.createElement('tr');
    if (SELECTED_ITEMS.leads.has(lead.id)) tr.classList.add('row-selected');
    tr.innerHTML = `
      <td style="text-align: center;" onclick="event.stopPropagation();">
        <input type="checkbox" class="cb-row" data-entity="leads" data-id="${lead.id}" ${SELECTED_ITEMS.leads.has(lead.id) ? 'checked' : ''} onchange="onRowSelectChange('leads')">
      </td>
      <td><strong>${lead.name}</strong><br><small>${lead.email||''}</small></td>
      <td>${formatPhoneNumber(lead.phone)}</td>
      <td><span class="badge badge-${lead.source.toLowerCase().replace('/','')}">${lead.source}</span></td>
      <td><span class="badge badge-status-${lead.status.toLowerCase().replace(/[- ]/g,'')}">${lead.status}</span></td>
      <td>${getDisplayDate(lead.dateAdded)}</td>
      <td>${formatNotes(lead.notes)}</td>
      <td>
        <div class="actions">
          <button class="btn-secondary btn-sm" onclick="editLead('${lead.id}')" title="Edit"><i class="fas fa-edit"></i></button>
          <button class="btn-primary btn-sm" onclick="promoteLead('${lead.id}')" title="Promote to Client"><i class="fas fa-level-up-alt"></i></button>
          <button class="btn-icon-danger" onclick="deleteLead('${lead.id}')" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
  updateBulkBar('leads');
}

window.editLead = function(id) {
  const lead = getData('leads').find(l => l.id === id);
  if (!lead) return;
  document.getElementById('leadId').value = lead.id;
  document.getElementById('leadName').value = lead.name;
  document.getElementById('leadPhone').value = formatPhoneNumber(lead.phone);
  document.getElementById('leadEmail').value = lead.email;
  document.getElementById('leadAddress').value = lead.address;
  document.getElementById('leadSource').value = lead.source;
  document.getElementById('leadStatus').value = lead.status;
  document.getElementById('leadNotes').value = lead.notes;
  document.getElementById('modalLeadTitle').innerText = 'Edit Lead';
  openModal('modalLead');
}

window.deleteLead = function(id) {
  if (!confirm('Are you sure you want to delete this lead?')) return;
  const leads = getData('leads').filter(l => l.id !== id);
  setData('leads', leads, false);
  deleteFromSupabase('leads', id);
  SELECTED_ITEMS.leads.delete(id);
  renderLeads();
  showToast('Lead deleted');
};
window.archiveLead = window.deleteLead;

window.promoteLead = function(id) {
  if(!confirm('Promote lead to Potential Client?')) return;
  const leads = getData('leads');
  const lead = leads.find(l => l.id === id);
  if(lead) {
    lead.archived = true;
    setData('leads', leads);
    const clients = getData('clients');
    clients.push({
      id: generateId(),
      name: lead.name, phone: lead.phone, email: lead.email, address: lead.address,
      status: 'Waiting - Other', estValue: '', notes: lead.notes, lastContact: new Date().toISOString().split('T')[0],
      addedBy: currentUser.id, promotedFrom: lead.id
    });
    setData('clients', clients);
    renderLeads();
    sendNotification('lead_promoted', lead);
    showToast('Lead promoted to Client!');
  }
}

// --- CLIENTS (List Table View) ---
function renderClients() {
  const clients = getData('clients');
  const statFilter = document.getElementById('filterClientStatus').value;
  const search = (document.getElementById('searchClients')?.value || '').toLowerCase();
  const tbody = document.querySelector('#clientsTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const filtered = clients.filter(c => {
    if (statFilter !== 'All' && c.status !== statFilter) return false;
    if (search && !c.name.toLowerCase().includes(search) && !(c.phone || '').includes(search) && !(c.address || '').toLowerCase().includes(search)) return false;
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 25px; color: #64748b;">No potential clients found.</td></tr>`;
    updateBulkBar('clients');
    return;
  }

  filtered.forEach(c => {
    const tr = document.createElement('tr');
    if (SELECTED_ITEMS.clients.has(c.id)) tr.classList.add('row-selected');
    tr.innerHTML = `
      <td style="text-align: center;" onclick="event.stopPropagation();">
        <input type="checkbox" class="cb-row" data-entity="clients" data-id="${c.id}" ${SELECTED_ITEMS.clients.has(c.id) ? 'checked' : ''} onchange="onRowSelectChange('clients')">
      </td>
      <td><strong>${c.name}</strong>${c.email ? `<br><small style="color:#64748b;">${c.email}</small>` : ''}</td>
      <td>${formatPhoneNumber(c.phone)}</td>
      <td>${c.address || '-'}</td>
      <td><span class="sn-state-pill sn-state-inprogress">${c.status}</span></td>
      <td>${c.estValue ? '$' + c.estValue : '-'}</td>
      <td>${formatNotes(c.notes)}</td>
      <td style="text-align: center;">
        <div class="actions" style="justify-content: center;">
          <button class="btn-secondary btn-sm" onclick="editClient('${c.id}')" title="Edit"><i class="fas fa-edit"></i></button>
          <button class="btn-primary btn-sm" onclick="promoteClient('${c.id}')" title="Start Build"><i class="fas fa-hard-hat"></i></button>
          <button class="btn-icon-danger" onclick="deleteClient('${c.id}')" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
  updateBulkBar('clients');
}

window.deleteClient = function(id) {
  if (!confirm('Are you sure you want to remove this client?')) return;
  const clients = getData('clients').filter(c => c.id !== id);
  setData('clients', clients, false);
  deleteFromSupabase('clients', id);
  SELECTED_ITEMS.clients.delete(id);
  renderClients();
  showToast('Client removed');
};

window.editClient = function(id) {
  const c = getData('clients').find(c => c.id === id);
  if (!c) return;
  document.getElementById('clientId').value = c.id;
  document.getElementById('clientName').value = c.name;
  document.getElementById('clientPhone').value = formatPhoneNumber(c.phone);
  document.getElementById('clientEmail').value = c.email;
  document.getElementById('clientAddress').value = c.address;
  document.getElementById('clientStatus').value = c.status;
  document.getElementById('clientEstValue').value = c.estValue;
  document.getElementById('clientLastContact').value = c.lastContact;
  document.getElementById('clientNotes').value = c.notes;
  document.getElementById('modalClientTitle').innerText = 'Edit Client';
  openModal('modalClient');
}

window.promoteClient = function(id) {
  const clients = getData('clients');
  const cIndex = clients.findIndex(c => c.id === id);
  if(cIndex > -1) {
    const c = clients[cIndex];
    document.getElementById('buildId').value = '';
    document.getElementById('buildClientName').value = c.name;
    document.getElementById('buildAddress').value = c.address;
    document.getElementById('buildStatus').value = 'Just Started';
    document.getElementById('modalBuildTitle').innerText = 'Start Build from Client';
    
    clients.splice(cIndex, 1);
    setData('clients', clients);
    renderClients();
    openModal('modalBuild');
  }
}

// --- BUILDS (List Table View) ---
function renderBuilds() {
  const builds = getData('builds');
  const statFilter = document.getElementById('filterBuildStatus')?.value || 'All';
  const search = (document.getElementById('searchBuilds')?.value || '').toLowerCase();
  const tbody = document.querySelector('#buildsTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const filtered = builds.filter(b => {
    if (statFilter !== 'All' && b.status !== statFilter) return false;
    if (search && !b.clientName.toLowerCase().includes(search) && !(b.address || '').toLowerCase().includes(search)) return false;
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 25px; color: #64748b;">No active builds found.</td></tr>`;
    updateBulkBar('builds');
    return;
  }

  filtered.forEach(b => {
    const tr = document.createElement('tr');
    if (SELECTED_ITEMS.builds.has(b.id)) tr.classList.add('row-selected');
    tr.innerHTML = `
      <td style="text-align: center;" onclick="event.stopPropagation();">
        <input type="checkbox" class="cb-row" data-entity="builds" data-id="${b.id}" ${SELECTED_ITEMS.builds.has(b.id) ? 'checked' : ''} onchange="onRowSelectChange('builds')">
      </td>
      <td><strong>${b.clientName}</strong></td>
      <td>${b.address}</td>
      <td>${b.material || '-'}</td>
      <td><span class="sn-state-pill ${b.status === 'Completed' ? 'sn-state-done' : (b.status === 'In Progress' ? 'sn-state-inprogress' : 'sn-state-todo')}">${b.status}</span></td>
      <td>${getDisplayDate(b.startDate)}</td>
      <td>${getDisplayDate(b.estCompletion)}</td>
      <td>${formatNotes(b.notes)}</td>
      <td style="text-align: center;">
        <div class="actions" style="justify-content: center;">
          <button class="btn-secondary btn-sm" onclick="editBuild('${b.id}')" title="Edit"><i class="fas fa-edit"></i></button>
          <button class="btn-icon-danger" onclick="deleteBuild('${b.id}')" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
  updateBulkBar('builds');
}

window.deleteBuild = function(id) {
  if (!confirm('Are you sure you want to delete this build?')) return;
  const builds = getData('builds').filter(b => b.id !== id);
  setData('builds', builds, false);
  deleteFromSupabase('builds', id);
  SELECTED_ITEMS.builds.delete(id);
  renderBuilds();
  showToast('Build deleted');
};


window.editBuild = function(id) {
  const b = getData('builds').find(x => x.id === id);
  if (!b) return;
  document.getElementById('buildId').value = b.id;
  document.getElementById('buildClientName').value = b.clientName;
  document.getElementById('buildAddress').value = b.address;
  document.getElementById('buildMaterial').value = b.material;
  document.getElementById('buildStatus').value = b.status;
  document.getElementById('buildStartDate').value = b.startDate;
  document.getElementById('buildEstCompletion').value = b.estCompletion;
  document.getElementById('buildCrew').value = b.crew;
  document.getElementById('buildNotes').value = b.notes;
  
  if (b.status === 'Completed') {
    document.getElementById('buildFinalValueGroup').style.display = 'block';
    document.getElementById('buildFinalValue').value = b.finalValue || '';
  } else {
    document.getElementById('buildFinalValueGroup').style.display = 'none';
  }

  document.getElementById('modalBuildTitle').innerText = 'Edit Build';
  openModal('modalBuild');
}

document.getElementById('buildStatus').addEventListener('change', function(e) {
  if (e.target.value === 'Completed') {
    document.getElementById('buildFinalValueGroup').style.display = 'block';
  } else {
    document.getElementById('buildFinalValueGroup').style.display = 'none';
  }
});

function renderPastBuilds() {
  const past = getData('pastBuilds');
  const search = document.getElementById('searchPastBuilds').value.toLowerCase();
  const tbody = document.querySelector('#pastBuildsTable tbody');
  tbody.innerHTML = '';
  
  const filtered = past.filter(p => !search || p.clientName.toLowerCase().includes(search) || p.address.toLowerCase().includes(search));
  
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;">No past builds found.</td></tr>`;
    updateBulkBar('pastBuilds');
    return;
  }

  filtered.forEach(p => {
    const tr = document.createElement('tr');
    if (SELECTED_ITEMS.pastBuilds.has(p.id)) tr.classList.add('row-selected');
    tr.innerHTML = `
      <td style="text-align: center;" onclick="event.stopPropagation();">
        <input type="checkbox" class="cb-row" data-entity="pastBuilds" data-id="${p.id}" ${SELECTED_ITEMS.pastBuilds.has(p.id) ? 'checked' : ''} onchange="onRowSelectChange('pastBuilds')">
      </td>
      <td><strong>${p.clientName}</strong></td>
      <td>${p.address}</td>
      <td>${p.material || '-'}</td>
      <td>${getDisplayDate(p.startDate)}</td>
      <td>${getDisplayDate(p.endDate)}</td>
      <td>$${p.finalValue || 0}</td>
      <td>${formatNotes(p.notes)}</td>
      <td style="text-align: center;">
        <button class="btn-icon-danger" onclick="deletePastBuild('${p.id}')" title="Delete Past Build">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  updateBulkBar('pastBuilds');
}

window.deletePastBuild = function(id) {
  if (!confirm('Are you sure you want to remove this past build?')) return;
  const past = getData('pastBuilds').filter(p => p.id !== id);
  setData('pastBuilds', past, false);
  deleteFromSupabase('pastBuilds', id);
  SELECTED_ITEMS.pastBuilds.delete(id);
  renderPastBuilds();
  showToast('Past build removed');
};

/* ==========================================================================
   CSV EXPORT UTILITIES & HANDLERS (Tasks, Leads, Clients, Builds, Past Builds)
   ========================================================================== */
function formatCSVDate(val) {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  return d.toLocaleDateString();
}

function downloadCSV(filename, headers, rows) {
  if (!rows || rows.length === 0) {
    showToast('No data to export', 'error');
    return false;
  }
  const csvContent = [
    headers.map(h => `"${String(h || '').replace(/"/g, '""')}"`).join(','),
    ...rows.map(row =>
      row.map(val => {
        if (val === null || val === undefined) return '""';
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(',')
    )
  ].join('\r\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

// 1. Leads CSV Export
document.getElementById('btnExportLeads')?.addEventListener('click', () => {
  const leads = getData('leads').filter(l => !l.archived);
  const isSelective = SELECTED_ITEMS.leads && SELECTED_ITEMS.leads.size > 0;
  const list = isSelective
    ? leads.filter(l => SELECTED_ITEMS.leads.has(l.id))
    : leads.filter(l => {
        const srcFilter = document.getElementById('filterLeadSource')?.value || 'All';
        const statFilter = document.getElementById('filterLeadStatus')?.value || 'All';
        const search = (document.getElementById('searchLeads')?.value || '').toLowerCase();
        if (srcFilter !== 'All' && l.source !== srcFilter) return false;
        if (statFilter !== 'All' && l.status !== statFilter) return false;
        if (search && !(l.name || '').toLowerCase().includes(search) && !(l.phone || '').includes(search)) return false;
        return true;
      });

  if (list.length === 0) {
    showToast('No leads to export', 'error');
    return;
  }

  const headers = ['Name', 'Phone', 'Email', 'Address', 'Source', 'Status', 'Date Added', 'Notes'];
  const rows = list.map(l => [
    l.name || '',
    formatPhoneNumber(l.phone),
    l.email || '',
    l.address || '',
    l.source || '',
    l.status || '',
    formatCSVDate(l.dateAdded),
    l.notes || ''
  ]);

  if (downloadCSV('Everest_Leads_Export.csv', headers, rows)) {
    showToast(isSelective ? `Exported ${list.length} selected lead(s)` : `Exported ${list.length} lead(s) to CSV`);
  }
});

// 2. Potential Clients CSV Export
document.getElementById('btnExportClients')?.addEventListener('click', () => {
  const clients = getData('clients');
  const isSelective = SELECTED_ITEMS.clients && SELECTED_ITEMS.clients.size > 0;
  const list = isSelective
    ? clients.filter(c => SELECTED_ITEMS.clients.has(c.id))
    : clients.filter(c => {
        const statFilter = document.getElementById('filterClientStatus')?.value || 'All';
        const search = (document.getElementById('searchClients')?.value || '').toLowerCase();
        if (statFilter !== 'All' && c.status !== statFilter) return false;
        if (search && !(c.name || '').toLowerCase().includes(search) && !(c.phone || '').includes(search) && !(c.address || '').toLowerCase().includes(search)) return false;
        return true;
      });

  if (list.length === 0) {
    showToast('No clients to export', 'error');
    return;
  }

  const headers = ['Name', 'Phone', 'Email', 'Address', 'Status', 'Est. Value', 'Notes'];
  const rows = list.map(c => [
    c.name || '',
    formatPhoneNumber(c.phone),
    c.email || '',
    c.address || '',
    c.status || '',
    c.estValue ? ('$' + c.estValue) : '',
    c.notes || ''
  ]);

  if (downloadCSV('Everest_Clients_Export.csv', headers, rows)) {
    showToast(isSelective ? `Exported ${list.length} selected client(s)` : `Exported ${list.length} client(s) to CSV`);
  }
});

// 3. Active Builds CSV Export
document.getElementById('btnExportBuilds')?.addEventListener('click', () => {
  const builds = getData('builds');
  const isSelective = SELECTED_ITEMS.builds && SELECTED_ITEMS.builds.size > 0;
  const list = isSelective
    ? builds.filter(b => SELECTED_ITEMS.builds.has(b.id))
    : builds.filter(b => {
        const statFilter = document.getElementById('filterBuildStatus')?.value || 'All';
        const search = (document.getElementById('searchBuilds')?.value || '').toLowerCase();
        if (statFilter !== 'All' && b.status !== statFilter) return false;
        if (search && !(b.clientName || '').toLowerCase().includes(search) && !(b.address || '').toLowerCase().includes(search)) return false;
        return true;
      });

  if (list.length === 0) {
    showToast('No builds to export', 'error');
    return;
  }

  const headers = ['Client Name', 'Address', 'Material', 'Status', 'Start Date', 'Est. Completion', 'Crew', 'Notes'];
  const rows = list.map(b => [
    b.clientName || '',
    b.address || '',
    b.material || '',
    b.status || '',
    formatCSVDate(b.startDate),
    formatCSVDate(b.estCompletion),
    b.crew || '',
    b.notes || ''
  ]);

  if (downloadCSV('Everest_Active_Builds_Export.csv', headers, rows)) {
    showToast(isSelective ? `Exported ${list.length} selected build(s)` : `Exported ${list.length} build(s) to CSV`);
  }
});

// 4. Past Builds CSV Export
document.getElementById('btnExportPastBuilds')?.addEventListener('click', () => {
  const past = getData('pastBuilds');
  const isSelective = SELECTED_ITEMS.pastBuilds && SELECTED_ITEMS.pastBuilds.size > 0;
  const list = isSelective
    ? past.filter(p => SELECTED_ITEMS.pastBuilds.has(p.id))
    : past.filter(p => {
        const search = (document.getElementById('searchPastBuilds')?.value || '').toLowerCase();
        if (search && !(p.clientName || '').toLowerCase().includes(search) && !(p.address || '').toLowerCase().includes(search) && !(p.material || '').toLowerCase().includes(search)) return false;
        return true;
      });

  if (list.length === 0) {
    showToast('No past builds to export', 'error');
    return;
  }

  const headers = ['Client Name', 'Address', 'Material', 'Start Date', 'End Date', 'Final Value', 'Notes'];
  const rows = list.map(p => [
    p.clientName || '',
    p.address || '',
    p.material || '',
    formatCSVDate(p.startDate),
    formatCSVDate(p.endDate),
    p.finalValue ? ('$' + p.finalValue) : '',
    p.notes || ''
  ]);

  if (downloadCSV('Everest_Past_Builds_Export.csv', headers, rows)) {
    showToast(isSelective ? `Exported ${list.length} selected past build(s)` : `Exported ${list.length} past build(s) to CSV`);
  }
});

// 5. Tasks CSV Export
document.getElementById('btnExportTickets')?.addEventListener('click', () => {
  const tickets = getData('tickets');
  const isSelective = SELECTED_ITEMS.tickets && SELECTED_ITEMS.tickets.size > 0;
  const list = isSelective
    ? tickets.filter(t => SELECTED_ITEMS.tickets.has(t.id))
    : tickets.filter(t => {
        const assignee = document.getElementById('filterTicketAssignee')?.value || 'All';
        const status = document.getElementById('filterTicketStatus')?.value || 'All';
        const search = (document.getElementById('searchTickets')?.value || '').toLowerCase();
        const normStatus = normalizeTaskStatus(t.status);
        if (assignee !== 'All' && t.assignee !== assignee) return false;
        if (status !== 'All' && normStatus !== status) return false;
        const desc = (t.description || t.title || '').toLowerCase();
        if (search && !desc.includes(search)) return false;
        return true;
      });

  if (list.length === 0) {
    showToast('No tasks to export', 'error');
    return;
  }

  const headers = ['Description', 'State', 'Assigned To', 'Date Created'];
  const rows = list.map(t => [
    t.description || t.title || 'Untitled Task',
    normalizeTaskStatus(t.status),
    t.assignee && t.assignee !== 'Unassigned' ? t.assignee : 'Unassigned',
    formatCSVDate(t.createdAt)
  ]);

  if (downloadCSV('Everest_Tasks_Export.csv', headers, rows)) {
    showToast(isSelective ? `Exported ${list.length} selected task(s)` : `Exported ${list.length} task(s) to CSV`);
  }
});

// --- TASKS (List View: Description, State, Assigned to) ---
const INITIAL_TICKETS = [
  { description: 'Roofing Website', assignee: 'KN', status: 'In Progress' },
  { description: 'Pool Website', assignee: 'KN', status: 'Pending' },
  { description: 'Pool Social Media', assignee: 'KN', status: 'Pending' },
  { description: 'Build a CRM', assignee: 'KN', status: 'In Progress' },
  { description: 'Automated Text to AK for Critical To-Dos', assignee: 'Unassigned', status: 'Pending' },
  { description: 'Roofing Metal & Spanish Style Clay Pricing', assignee: 'AK', status: 'Pending' },
  { description: 'Google Review Boost', assignee: 'Unassigned', status: 'Pending' },
  { description: 'Business Phone Number Setup', assignee: 'Unassigned', status: 'Pending' },
];

function seedInitialTickets() {
  if (localStorage.getItem('crm_tickets_seeded')) return;
  const tickets = INITIAL_TICKETS.map(t => ({
    id: generateId(),
    description: t.description,
    status: t.status,
    assignee: t.assignee,
    createdAt: new Date().toISOString(),
  }));
  setData('tickets', tickets, false);
  localStorage.setItem('crm_tickets_seeded', 'true');
}

function normalizeTaskStatus(status) {
  const s = (status || '').toLowerCase().trim();
  if (s.includes('progress')) return 'In Progress';
  if (s.includes('complete') || s.includes('done') || s.includes('closed')) return 'Completed';
  return 'Pending';
}

function renderTickets() {
  const tickets = getData('tickets');
  const assignee = document.getElementById('filterTicketAssignee')?.value || 'All';
  const status = document.getElementById('filterTicketStatus')?.value || 'All';
  const search = (document.getElementById('searchTickets')?.value || '').toLowerCase();
  
  const filtered = tickets.filter(t => {
    const normStatus = normalizeTaskStatus(t.status);
    if(assignee !== 'All' && t.assignee !== assignee) return false;
    if(status !== 'All' && normStatus !== status) return false;
    const desc = (t.description || t.title || '').toLowerCase();
    if(search && !desc.includes(search)) return false;
    return true;
  });

  const tbody = document.getElementById('ticketsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 25px; color: #64748b;">No tasks found.</td></tr>`;
    updateBulkBar('tickets');
    return;
  }

  filtered.forEach(t => {
    const tr = document.createElement('tr');
    if (SELECTED_ITEMS.tickets.has(t.id)) tr.classList.add('row-selected');
    const desc = t.description || t.title || 'Untitled Task';
    const normStatus = normalizeTaskStatus(t.status);
    let stateCls = 'sn-state-todo';
    if (normStatus === 'In Progress') stateCls = 'sn-state-inprogress';
    else if (normStatus === 'Completed') stateCls = 'sn-state-done';

    tr.innerHTML = `
      <td style="text-align: center;" onclick="event.stopPropagation();">
        <input type="checkbox" class="cb-row" data-entity="tickets" data-id="${t.id}" ${SELECTED_ITEMS.tickets.has(t.id) ? 'checked' : ''} onchange="onRowSelectChange('tickets')">
      </td>
      <td>
        <span class="sn-title-link" onclick="openTicketModal('${t.id}')" title="Click to open/edit task">
          ${desc}
        </span>
      </td>
      <td>
        <span class="sn-state-pill ${stateCls}">${normStatus}</span>
      </td>
      <td style="font-weight: 600; color: #334155;">
        ${t.assignee && t.assignee !== 'Unassigned' ? t.assignee : '<span style="color:#94a3b8;font-style:italic;">Unassigned</span>'}
      </td>
      <td style="text-align: center;">
        <div class="actions" style="justify-content: center;">
          <button class="btn-secondary btn-sm" onclick="openTicketModal('${t.id}')" title="Open Task"><i class="fas fa-edit"></i></button>
          <button class="btn-icon-danger" onclick="deleteTicket('${t.id}')" title="Delete Task"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
  updateBulkBar('tickets');
}

window.openTicketModal = function(id) {
  const t = getData('tickets').find(x => x.id === id);
  if (!t) return;
  document.getElementById('ticketId').value = t.id;
  document.getElementById('ticketDescription').value = t.description || t.title || '';
  document.getElementById('ticketStatus').value = normalizeTaskStatus(t.status);
  document.getElementById('ticketAssignee').value = t.assignee || 'Unassigned';
  document.getElementById('modalTicketTitle').innerText = 'Edit Task';
  document.getElementById('btnDeleteTicketModal').style.display = 'inline-block';
  openModal('modalTicket');
};

window.deleteTicket = function(id) {
  if (!confirm('Are you sure you want to delete this task?')) return;
  const tickets = getData('tickets').filter(t => t.id !== id);
  setData('tickets', tickets, false);
  deleteFromSupabase('tickets', id);
  SELECTED_ITEMS.tickets.delete(id);
  closeModal('modalTicket');
  renderTickets();
  showToast('Task deleted');
};


document.getElementById('ticketDrawerClose').addEventListener('click', () => {
  document.getElementById('ticketDrawer').classList.remove('open');
  currentDrawerTicketId = null;
});

function logTicketEvent(ticket, action) {
  if(!ticket.history) ticket.history = [];
  ticket.history.push({ action, by: currentUser.displayName, timestamp: new Date().toISOString() });
}

document.getElementById('drawerStatus').addEventListener('change', e => {
  if(!currentDrawerTicketId) return;
  const tickets = getData('tickets');
  const t = tickets.find(x => x.id === currentDrawerTicketId);
  if(t) {
    const old = t.status;
    t.status = e.target.value;
    logTicketEvent(t, `changed status from ${old} to ${t.status}`);
    setData('tickets', tickets);
    renderTickets();
    if (t.status === 'Done' && old !== 'Done') sendNotification('ticket_done', t);
    showToast('Ticket updated');
  }
});

document.getElementById('drawerAssignee').addEventListener('change', e => {
  if(!currentDrawerTicketId) return;
  const tickets = getData('tickets');
  const t = tickets.find(x => x.id === currentDrawerTicketId);
  if(t) {
    const old = t.assignee;
    t.assignee = e.target.value;
    logTicketEvent(t, `changed assignee from ${old} to ${t.assignee}`);
    setData('tickets', tickets);
    renderTickets();
    showToast('Ticket updated');
  }
});

document.getElementById('btnPostComment').addEventListener('click', () => {
  const input = document.getElementById('drawerCommentInput');
  const text = input.value.trim();
  if(!text || !currentDrawerTicketId) return;
  
  const tickets = getData('tickets');
  const t = tickets.find(x => x.id === currentDrawerTicketId);
  if(t) {
    if(!t.comments) t.comments = [];
    t.comments.push({ id: generateId(), author: currentUser.displayName, text, timestamp: new Date().toISOString() });
    logTicketEvent(t, 'added a comment');
    setData('tickets', tickets);
    input.value = '';
    window.openTicketDrawer(t.id); // Re-render drawer
    showToast('Comment posted');
  }
});


// --- VAULT ---
async function renderVault() {
  if(currentUser.role !== 'admin') return;
  const entries = getVaultEntries();
  const grid = document.getElementById('vaultGrid');
  grid.innerHTML = '';
  
  for (const e of entries) {
    const card = document.createElement('div');
    card.className = 'vault-card';
    
    let pwdDisplay = '';
    if(e.passwordEncrypted) {
      try {
        const dec = await decryptPassword(e.passwordEncrypted);
        pwdDisplay = `<div class="pwd-masked" id="pwd-${e.id}">••••••••</div>
                      <button class="btn-secondary btn-sm" onclick="toggleVaultPwd('${e.id}', '${dec.replace(/'/g, "\\'")}')" title="Reveal"><i class="fas fa-eye"></i></button>
                      <button class="btn-secondary btn-sm" onclick="navigator.clipboard.writeText('${dec.replace(/'/g, "\\'")}'); showToast('Password copied')" title="Copy"><i class="fas fa-copy"></i></button>`;
      } catch(err) {
        pwdDisplay = `<div class="pwd-masked" style="color:red">Error decrypting</div>`;
      }
    } else {
      pwdDisplay = `<div class="pwd-masked" style="color:var(--brand-gold); font-weight:bold;">⚠️ Add password</div>`;
    }

    card.innerHTML = `
      <div class="vault-actions">
        <button class="btn-secondary btn-sm" onclick="editVaultEntry('${e.id}')"><i class="fas fa-edit"></i></button>
        <button class="btn-danger btn-sm" onclick="deleteVaultEntry('${e.id}')"><i class="fas fa-trash"></i></button>
      </div>
      <span class="icon">${e.icon || '🔑'}</span>
      <h3 style="margin-bottom:10px;">${e.service}</h3>
      <div style="font-size:12px; margin-bottom:5px;"><strong>User:</strong> ${e.username || '-'}</div>
      <div style="font-size:12px; margin-bottom:10px;"><strong>Email:</strong> ${e.email || '-'}</div>
      <div style="display:flex; gap:5px; align-items:center; margin-bottom:10px;">
        ${pwdDisplay}
      </div>
      ${e.url ? `<a href="${e.url}" target="_blank" style="font-size:12px; color:var(--brand-gold);">Open Link <i class="fas fa-external-link-alt"></i></a>` : ''}
    `;
    grid.appendChild(card);
  }
}

window.toggleVaultPwd = function(id, pwd) {
  const el = document.getElementById(`pwd-${id}`);
  if(el.innerText === '••••••••') el.innerText = pwd;
  else el.innerText = '••••••••';
};

window.editVaultEntry = async function(id) {
  const entries = getVaultEntries();
  const e = entries.find(x => x.id === id);
  if(!e) return;
  document.getElementById('vaultId').value = e.id;
  document.getElementById('vaultService').value = e.service;
  document.getElementById('vaultIcon').value = e.icon;
  document.getElementById('vaultUrl').value = e.url;
  document.getElementById('vaultUsername').value = e.username;
  document.getElementById('vaultEmail').value = e.email;
  document.getElementById('vaultNotes').value = e.notes;
  document.getElementById('vaultPassword').value = e.passwordEncrypted ? await decryptPassword(e.passwordEncrypted) : '';
  document.getElementById('modalVaultTitle').innerText = 'Edit Vault Entry';
  openModal('modalVaultEntry');
}

window.deleteVaultEntry = function(id) {
  if(!confirm('Delete this vault entry?')) return;
  const entries = getVaultEntries().filter(e => e.id !== id);
  setData('vault', entries);
  renderVault();
  showToast('Vault entry deleted');
}

// --- CALENDAR ---
window.openGCalForLead = function(id) {
  const lead = getData('leads').find(l => l.id === id);
  if(!lead) return;
  const title = encodeURIComponent(`Estimate: ${lead.name}`);
  const location = encodeURIComponent(lead.address || '');
  const details = encodeURIComponent(`Phone: ${lead.phone}\nNotes: ${lead.notes}`);
  window.open(`https://calendar.google.com/calendar/r/eventedit?text=${title}&location=${location}&details=${details}`, '_blank');
}

function loadCalendar() {
  const calUrl = localStorage.getItem(STORAGE_KEYS.calendarUrl);
  const container = document.getElementById('calendarContainer');
  if(calUrl) {
    document.getElementById('calendarUrlInput').value = calUrl;
    container.innerHTML = `<iframe src="${calUrl}" style="border: 0" width="100%" height="100%" frameborder="0" scrolling="no"></iframe>`;
  } else {
    container.innerHTML = `<div class="calendar-placeholder">No Calendar Configured</div>`;
  }
}





/* ==========================================================================
   6. FORM SUBMISSIONS
   ========================================================================== */

document.getElementById('formLead').addEventListener('submit', e => {
  e.preventDefault();
  const id = document.getElementById('leadId').value;
  const existingLead = !isNew ? getData('leads').find(l => l.id === id) : null;
  const lead = {
    id: isNew ? generateId() : id,
    name: document.getElementById('leadName').value.trim(),
    phone: document.getElementById('leadPhone').value.trim(),
    email: document.getElementById('leadEmail').value.trim(),
    address: document.getElementById('leadAddress').value.trim(),
    source: document.getElementById('leadSource').value,
    status: document.getElementById('leadStatus').value,
    notes: document.getElementById('leadNotes').value.trim(),
    dateAdded: isNew ? new Date().toISOString() : (existingLead?.dateAdded || new Date().toISOString()),
    addedBy: isNew ? (currentUser?.displayName || currentUser?.id || 'Admin') : (existingLead?.addedBy || 'Admin'),
    archived: false
  };
  
  const leads = getData('leads');
  if(isNew) leads.unshift(lead);
  else {
    const idx = leads.findIndex(l => l.id === id);
    if(idx > -1) leads[idx] = lead;
  }
  setData('leads', leads);
  closeModal('modalLead');
  renderLeads();
  if (isNew) sendNotification('new_lead', lead);
  showToast(isNew ? 'Lead added' : 'Lead updated');
});

document.getElementById('formClient').addEventListener('submit', e => {
  e.preventDefault();
  const id = document.getElementById('clientId').value;
  const isNew = !id;
  const existingClient = !isNew ? getData('clients').find(c => c.id === id) : null;
  const client = {
    id: isNew ? generateId() : id,
    name: document.getElementById('clientName').value.trim(),
    phone: document.getElementById('clientPhone').value.trim(),
    email: document.getElementById('clientEmail').value.trim(),
    address: document.getElementById('clientAddress').value.trim(),
    status: document.getElementById('clientStatus').value,
    estValue: document.getElementById('clientEstValue').value.trim(),
    lastContact: document.getElementById('clientLastContact').value,
    notes: document.getElementById('clientNotes').value.trim(),
    addedBy: isNew ? (currentUser?.displayName || currentUser?.id || 'Admin') : (existingClient?.addedBy || 'Admin')
  };
  
  const clients = getData('clients');
  if(isNew) clients.push(client);
  else {
    const idx = clients.findIndex(c => c.id === id);
    if(idx > -1) clients[idx] = client;
  }
  setData('clients', clients);
  closeModal('modalClient');
  renderClients();
  showToast(isNew ? 'Client added' : 'Client updated');
});

document.getElementById('formBuild').addEventListener('submit', e => {
  e.preventDefault();
  const id = document.getElementById('buildId').value;
  const isNew = !id;
  const status = document.getElementById('buildStatus').value;
  
  const build = {
    id: isNew ? generateId() : id,
    clientName: document.getElementById('buildClientName').value,
    address: document.getElementById('buildAddress').value,
    material: document.getElementById('buildMaterial').value,
    status: status,
    startDate: document.getElementById('buildStartDate').value,
    estCompletion: document.getElementById('buildEstCompletion').value,
    crew: document.getElementById('buildCrew').value,
    notes: document.getElementById('buildNotes').value,
    finalValue: document.getElementById('buildFinalValue').value
  };
  
  const builds = getData('builds');
  
  if (status === 'Completed') {
    if(confirm('Build is completed. Move to Past Builds?')) {
      build.endDate = new Date().toISOString().split('T')[0];
      const past = getData('pastBuilds');
      past.push(build);
      setData('pastBuilds', past);
      
      if(!isNew) {
        const idx = builds.findIndex(b => b.id === id);
        if(idx > -1) builds.splice(idx, 1);
        setData('builds', builds, false);
        deleteFromSupabase('builds', id);
      }
      closeModal('modalBuild');
      renderBuilds();
      renderPastBuilds();
      showToast('Build moved to Past Builds');
      return;
    }
  }

  if(isNew) builds.push(build);
  else {
    const idx = builds.findIndex(b => b.id === id);
    if(idx > -1) builds[idx] = build;
  }
  setData('builds', builds);
  closeModal('modalBuild');
  renderBuilds();
  if (isNew) sendNotification('new_build', build);
  showToast(isNew ? 'Build added' : 'Build updated');
});

document.getElementById('formTicket').addEventListener('submit', e => {
  e.preventDefault();
  const id = document.getElementById('ticketId').value;
  const isNew = !id;
  const desc = document.getElementById('ticketDescription').value.trim();
  const status = document.getElementById('ticketStatus').value;
  const assignee = document.getElementById('ticketAssignee').value;

  const ticket = {
    id: isNew ? generateId() : id,
    description: desc,
    title: desc,
    status: status,
    assignee: assignee,
    createdAt: isNew ? new Date().toISOString() : (getData('tickets').find(t => t.id === id)?.createdAt || new Date().toISOString()),
  };

  const tickets = getData('tickets');
  if (isNew) tickets.unshift(ticket);
  else {
    const idx = tickets.findIndex(t => t.id === id);
    if (idx > -1) tickets[idx] = ticket;
  }
  setData('tickets', tickets);
  closeModal('modalTicket');
  renderTickets();
  if (status === 'Completed') {
    sendNotification('ticket_done', ticket);
  }
  showToast(isNew ? 'Task created' : 'Task updated');
});

document.getElementById('formVaultEntry').addEventListener('submit', async e => {
  e.preventDefault();
  if(currentUser.role !== 'admin') return;
  
  const id = document.getElementById('vaultId').value;
  const isNew = !id;
  const pwd = document.getElementById('vaultPassword').value;
  
  let enc = null;
  if(pwd) {
    try {
      enc = await encryptPassword(pwd);
    } catch(err) {
      showToast('Encryption error', 'error');
      return;
    }
  }

  const entry = {
    id: isNew ? generateId() : id,
    service: document.getElementById('vaultService').value,
    icon: document.getElementById('vaultIcon').value,
    url: document.getElementById('vaultUrl').value,
    username: document.getElementById('vaultUsername').value,
    email: document.getElementById('vaultEmail').value,
    notes: document.getElementById('vaultNotes').value,
    passwordEncrypted: enc,
    addedAt: isNew ? new Date().toISOString() : getVaultEntries().find(x=>x.id===id).addedAt
  };

  const entries = getVaultEntries();
  if(isNew) entries.push(entry);
  else {
    const idx = entries.findIndex(x => x.id === id);
    if(idx > -1) {
      if(!pwd && entries[idx].passwordEncrypted) {
        entry.passwordEncrypted = entries[idx].passwordEncrypted; // preserve if untouched
      }
      entries[idx] = entry;
    }
  }
  setData('vault', entries);
  closeModal('modalVaultEntry');
  renderVault();
  showToast('Vault entry saved');
});


/* ==========================================================================
   7. UI UTILS & EVENT LISTENERS
   ========================================================================== */
function showSection(sectionName) {
  // Hide all sections via inline style (overrides any hardcoded style="display:none")
  document.querySelectorAll('.section').forEach(s => {
    s.classList.remove('active');
    s.style.display = 'none';
  });
  // Show the target section
  const target = document.getElementById('section-' + sectionName);
  if (target) {
    target.classList.add('active');
    target.style.display = 'block';
  }
  // Update sidebar nav highlight
  document.querySelectorAll('.nav-item[data-section]').forEach(n => n.classList.remove('active'));
  const navBtn = document.querySelector(`.nav-item[data-section="${sectionName}"]`);
  if (navBtn) navBtn.classList.add('active');

  if (window.innerWidth <= 768) {
    document.getElementById('sidebar')?.classList.remove('open');
    const overlay = document.getElementById('sidebarOverlay');
    if (overlay) {
      overlay.classList.remove('active');
      overlay.style.display = 'none';
    }
  }

  if (sectionName === 'leads') { importWebsiteLeads(); renderLeads(); }
  if (sectionName === 'clients') renderClients();
  if (sectionName === 'builds') renderBuilds();
  if (sectionName === 'pastbuilds') renderPastBuilds();
  if (sectionName === 'tickets') renderTickets();
  if (sectionName === 'vault') renderVault();
  if (sectionName === 'calendar') loadCalendar();
}

function openModal(modalId) {
  if(modalId === 'modalLead' && !document.getElementById('leadId').value) document.getElementById('formLead').reset();
  if(modalId === 'modalClient' && !document.getElementById('clientId').value) document.getElementById('formClient').reset();
  if(modalId === 'modalBuild' && !document.getElementById('buildId').value) document.getElementById('formBuild').reset();
  if(modalId === 'modalPastBuild' && !document.getElementById('pastBuildId').value) document.getElementById('formPastBuild').reset();
  if(modalId === 'modalTicket' && !document.getElementById('ticketId').value) document.getElementById('formTicket').reset();
  if(modalId === 'modalVaultEntry' && !document.getElementById('vaultId').value) document.getElementById('formVaultEntry').reset();
  
  document.getElementById(modalId).classList.add('open');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('open');
  const form = document.querySelector(`#${modalId} form`);
  if(form) {
    form.reset();
    const hidden = form.querySelector('input[type="hidden"]');
    if(hidden) hidden.value = '';
  }
}

document.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
  btn.addEventListener('click', e => {
    const modal = e.target.closest('.modal-overlay');
    if(modal) closeModal(modal.id);
  });
});

function showToast(msg, type='success') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${msg}</span> <i class="fas fa-${type==='success'?'check-circle':'exclamation-circle'}" style="color:var(--${type})"></i>`;
  document.getElementById('toastContainer').appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 3000);
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const u = document.getElementById('loginUsername').value;
  const p = document.getElementById('loginPassword').value;
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  btn.innerText = 'Logging in...';
  
  if (await login(u, p)) {
    initApp();
  } else {
    document.getElementById('loginError').innerText = 'Invalid username or password.';
  }
  
  btn.disabled = false;
  btn.innerText = 'Login';
});

document.getElementById('btnLogout').addEventListener('click', logout);

document.querySelectorAll('.nav-item[data-section]').forEach(btn => {
  btn.addEventListener('click', e => showSection(e.currentTarget.dataset.section));
});

document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
  document.getElementById('sidebar').classList.add('open');
  const overlay = document.getElementById('sidebarOverlay');
  if (overlay) {
    overlay.classList.add('active');
    overlay.style.display = 'block';
  }
});

['closeSidebarBtn', 'sidebarOverlay'].forEach(id => {
  document.getElementById(id)?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
    const overlay = document.getElementById('sidebarOverlay');
    if (overlay) {
      overlay.classList.remove('active');
      overlay.style.display = 'none';
    }
  });
});

// Button binding
document.getElementById('btnAddLead').addEventListener('click', () => { document.getElementById('modalLeadTitle').innerText = 'Add Lead'; openModal('modalLead'); });
document.getElementById('btnAddClient').addEventListener('click', () => { document.getElementById('modalClientTitle').innerText = 'Add Client'; openModal('modalClient'); });
document.getElementById('btnAddBuild').addEventListener('click', () => { document.getElementById('modalBuildTitle').innerText = 'Add Build'; openModal('modalBuild'); });
document.getElementById('btnAddPastBuild').addEventListener('click', () => { document.getElementById('modalPastBuildTitle').innerText = 'Add Past Build'; openModal('modalPastBuild'); });
document.getElementById('btnAddTicket').addEventListener('click', () => {
  document.getElementById('modalTicketTitle').innerText = 'New Task';
  document.getElementById('formTicket').reset();
  document.getElementById('ticketId').value = '';
  document.getElementById('btnDeleteTicketModal').style.display = 'none';
  openModal('modalTicket');
});

// Modal delete button for task
document.getElementById('btnDeleteTicketModal')?.addEventListener('click', () => {
  const id = document.getElementById('ticketId').value;
  if (id) {
    deleteTicket(id);
  }
});

// Form Past Build submit
document.getElementById('formPastBuild').addEventListener('submit', e => {
  e.preventDefault();
  const id = document.getElementById('pastBuildId').value;
  const isNew = !id;
  const pastBuild = {
    id: isNew ? generateId() : id,
    clientName: document.getElementById('pastClientName').value,
    address: document.getElementById('pastAddress').value,
    material: document.getElementById('pastMaterial').value,
    startDate: document.getElementById('pastStartDate').value,
    endDate: document.getElementById('pastEndDate').value,
    finalValue: document.getElementById('pastFinalValue').value,
    notes: document.getElementById('pastNotes').value,
  };
  const past = getData('pastBuilds');
  if (isNew) past.unshift(pastBuild);
  else {
    const idx = past.findIndex(p => p.id === id);
    if (idx > -1) past[idx] = pastBuild;
  }
  setData('pastBuilds', past);
  closeModal('modalPastBuild');
  renderPastBuilds();
  showToast(isNew ? 'Past build added' : 'Past build updated');
});

// Filters & Search binding for all list views
['filterLeadSource', 'filterLeadStatus', 'searchLeads'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', () => renderLeads());
});

document.getElementById('filterClientStatus')?.addEventListener('change', () => renderClients());
document.getElementById('searchClients')?.addEventListener('input', () => renderClients());

document.getElementById('filterBuildStatus')?.addEventListener('change', () => renderBuilds());
document.getElementById('searchBuilds')?.addEventListener('input', () => renderBuilds());

document.getElementById('searchPastBuilds')?.addEventListener('input', () => renderPastBuilds());

['filterTicketAssignee', 'filterTicketStatus', 'searchTickets'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', () => renderTickets());
  document.getElementById(id)?.addEventListener('change', () => renderTickets());
});

/* ==========================================================================
   8. THEME & STARTUP (Light / Dark)
   ========================================================================== */
function applyTheme(theme) {
  const effectiveTheme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', effectiveTheme);

  // Update 2-way toggle buttons in sidebar
  document.querySelectorAll('.theme-opt').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === effectiveTheme);
  });

  // Update mobile top bar button
  const mobileBtn = document.getElementById('mobileThemeBtn');
  if (mobileBtn) {
    mobileBtn.innerHTML = effectiveTheme === 'dark'
      ? '<i class="fas fa-sun" style="color: #facc15;" title="Switch to Light Mode"></i>'
      : '<i class="fas fa-moon" title="Switch to Dark Mode"></i>';
  }
}

function setThemeMode(theme) {
  const mode = theme === 'dark' ? 'dark' : 'light';
  localStorage.setItem('crm_theme_mode', mode);
  applyTheme(mode);
}

function initTheme() {
  let saved = localStorage.getItem('crm_theme_mode');
  if (!saved || saved === 'system') {
    saved = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  applyTheme(saved);

  // Bind icon buttons in sidebar
  document.querySelectorAll('.theme-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      setThemeMode(btn.dataset.mode);
    });
  });

  // Bind mobile header theme button to toggle Light / Dark
  const mobileBtn = document.getElementById('mobileThemeBtn');
  if (mobileBtn) {
    mobileBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      setThemeMode(next);
      showToast(next === 'dark' ? 'Dark Mode' : 'Light Mode');
    });
  }
}

async function initApp() {
  document.getElementById('loginOverlay').style.display = 'none';
  document.getElementById('app').style.display = 'flex';

  // 1. Connect to Supabase Cloud & pull fresh live data
  const cloudConnected = await initSupabase();

  // 2. Only seed fallback demo data if Supabase is completely disconnected and local storage is empty
  if (!cloudConnected) {
    if (!localStorage.getItem('crm_tickets_seeded') && getData('tickets').length === 0) {
      seedInitialTickets();
    }
    if (!localStorage.getItem('crm_leads_seeded') && getData('leads').length === 0) {
      seedInitialLeads();
    }
  } else {
    // Supabase is active: mark seeded flags so dummy seeding never runs
    localStorage.setItem('crm_tickets_seeded', 'true');
    localStorage.setItem('crm_leads_seeded', 'true');
  }

  initEmailJS();
  checkWebsiteLeadsBadge();

  showSection('tickets');
}

// Cloud Indicator click -> open modal
document.getElementById('cloudIndicator')?.addEventListener('click', () => {
  openModal('modalDataSync');
});

// Tab Switchers in Modal
document.getElementById('tabCloudSync')?.addEventListener('click', () => {
  document.getElementById('tabCloudSync').classList.add('active');
  document.getElementById('tabFileBackup').classList.remove('active');
  document.getElementById('sectionCloudSync').style.display = 'flex';
  document.getElementById('sectionFileBackup').style.display = 'none';
});

document.getElementById('tabFileBackup')?.addEventListener('click', () => {
  document.getElementById('tabFileBackup').classList.add('active');
  document.getElementById('tabCloudSync').classList.remove('active');
  document.getElementById('sectionFileBackup').style.display = 'flex';
  document.getElementById('sectionCloudSync').style.display = 'none';
});

// Save & Connect Supabase
document.getElementById('btnSaveSupabaseConfig')?.addEventListener('click', async () => {
  const url = document.getElementById('cfgSupabaseUrl').value.trim();
  const key = document.getElementById('cfgSupabaseKey').value.trim();
  if (!url || !key) {
    showToast('Please enter both Supabase URL and Key', 'error');
    return;
  }
  localStorage.setItem('crm_supabase_url', url);
  localStorage.setItem('crm_supabase_key', key);
  showToast('Connecting to Supabase...');
  const success = await initSupabase(true);
  if (success) {
    closeModal('modalDataSync');
  }
});

// Disconnect Supabase
document.getElementById('btnDisconnectSupabase')?.addEventListener('click', () => {
  if (!confirm('Disconnect from Supabase Cloud? Your local data will remain saved.')) return;
  localStorage.removeItem('crm_supabase_url');
  localStorage.removeItem('crm_supabase_key');
  if (supabaseClient && realtimeChannel) {
    supabaseClient.removeChannel(realtimeChannel);
  }
  supabaseClient = null;
  document.getElementById('cfgSupabaseUrl').value = '';
  document.getElementById('cfgSupabaseKey').value = '';
  updateCloudIndicator('offline', 'Local Mode');
  showToast('Disconnected from Supabase Cloud');
});

// Force Cloud Sync & Settings Toggle
document.getElementById('btnForceSync')?.addEventListener('click', async () => {
  showToast('Syncing with Supabase Cloud...');
  await pullAllFromCloud();
  showToast('All CRM tables up to date!');
});

document.getElementById('btnToggleConfigFields')?.addEventListener('click', () => {
  const fields = document.getElementById('cloudConfigFields');
  if (fields) {
    fields.style.display = fields.style.display === 'none' ? 'flex' : 'none';
  }
});

// Backup & Sync Modal Bindings
document.getElementById('btnDataSync')?.addEventListener('click', () => {
  openModal('modalDataSync');
});

document.getElementById('btnExportFullBackup')?.addEventListener('click', () => {
  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    leads: getData('leads'),
    clients: getData('clients'),
    builds: getData('builds'),
    pastBuilds: getData('pastBuilds'),
    tickets: getData('tickets')
  };
  const jsonStr = JSON.stringify(backup, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Everest_CRM_Backup_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Full backup downloaded!');
});

document.getElementById('btnTriggerImportBackup')?.addEventListener('click', () => {
  document.getElementById('inputImportBackup')?.click();
});

document.getElementById('inputImportBackup')?.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data || typeof data !== 'object') throw new Error('Invalid backup file format');
      if (Array.isArray(data.leads)) setData('leads', data.leads);
      if (Array.isArray(data.clients)) setData('clients', data.clients);
      if (Array.isArray(data.builds)) setData('builds', data.builds);
      if (Array.isArray(data.pastBuilds)) setData('pastBuilds', data.pastBuilds);
      if (Array.isArray(data.tickets)) setData('tickets', data.tickets);

      localStorage.setItem('crm_leads_seeded', 'true');
      localStorage.setItem('crm_tickets_seeded', 'true');

      renderTickets();
      renderLeads();
      renderClients();
      renderBuilds();
      renderPastBuilds();

      closeModal('modalDataSync');
      showToast('All CRM data restored successfully!');
    } catch (err) {
      showToast('Import failed: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
});

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  await initAuth();
  if (restoreSession()) {
    initApp();
  }
});
