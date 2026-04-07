import { APP_NAME, DEPARTMENTS, PANCHAYAT_NAMES } from "./config.js";

const STATUS_OPTIONS = ["Submitted", "Approved", "Acknowledged", "Resolved", "Rejected"];

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function badgeClass(value) {
  return String(value || "").toLowerCase().replaceAll(" ", "-");
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function toNumber(value) {
  return Number(value || 0);
}

function statsCards(stats = {}) {
  const rows = [
    ["Total", stats.total || 0],
    ["Submitted", stats.submitted || 0],
    ["Approved", stats.approved || 0],
    ["Acknowledged", stats.acknowledged || 0],
    ["Resolved", stats.resolved || 0],
    ["Rejected", stats.rejected || 0],
  ];
  return `<section class="stats-grid">${rows.map(([label, value]) => `<article class="stat-card"><small>${label}</small><strong>${value}</strong></article>`).join("")}</section>`;
}

function navItemsForRole(role) {
  const base = [["dashboard", "Dashboard"], ["live", "Live Complaints"], ["history", "Complaint History"], ["profile", "Profile"], ["settings", "Settings"]];
  if (role === "district_officer") {
    return [["dashboard", "Dashboard"], ["analytics", "Analytics"], ["live", "Live Complaints"], ["history", "Complaint History"], ["profile", "Profile"], ["settings", "Settings"]];
  }
  return base;
}

function pageTitle(user, activeView) {
  const labelMap = {
    dashboard: "Dashboard",
    analytics: "Analytics",
    live: "Live Complaints",
    history: "Complaint History",
    profile: "Profile",
    settings: "Settings",
  };
  const prefix = user.role === "district_officer"
    ? "District Officer"
    : user.role === "panchayat_admin"
      ? `${user.panchayat_name} Panchayat Admin`
      : user.role === "department_officer"
        ? `${user.department_name} Department`
        : user.full_name;
  return `${prefix} ${labelMap[activeView] || "Dashboard"}`;
}

function latestComplaints(complaints = [], count = 10) {
  return [...complaints].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, count);
}

function complaintActionButtons(userRole, complaint) {
  if (userRole === "panchayat_admin" && complaint.status === "Submitted") {
    return `<div class="actions"><button class="btn btn-primary" data-action="approve" data-id="${complaint.id}" data-department="${escapeHtml(complaint.department_name)}">Approve & Forward</button><button class="btn btn-danger" data-action="reject" data-id="${complaint.id}">Reject</button></div>`;
  }
  if (userRole === "department_officer" && complaint.status === "Approved") {
    return `<div class="actions"><button class="btn btn-secondary" data-action="acknowledge" data-id="${complaint.id}">Mark Received</button></div>`;
  }
  if (userRole === "department_officer" && complaint.status === "Acknowledged") {
    return `
      <div class="resolve-box">
        <div class="field"><label>Resolution note</label><textarea placeholder="What work was completed?"></textarea></div>
        <div class="field"><label>Proof photo</label><input type="file" accept="image/*" /></div>
        <div class="actions"><button class="btn btn-secondary" data-action="resolve" data-id="${complaint.id}">Upload Proof & Resolve</button></div>
      </div>
    `;
  }
  return "";
}

function complaintCard(userRole, complaint) {
  const mapLink = complaint.latitude && complaint.longitude ? `https://www.google.com/maps?q=${complaint.latitude},${complaint.longitude}` : "";
  return `
    <article class="complaint-card">
      <div class="complaint-head">
        <div>
          <h3>${escapeHtml(complaint.title)}</h3>
          <div class="badge-row">
            <span class="badge status-${badgeClass(complaint.status)}">${escapeHtml(complaint.status)}</span>
            <span class="badge priority-${badgeClass(complaint.priority)}">${escapeHtml(complaint.priority)}</span>
            <span class="badge">${escapeHtml(complaint.department_name)}</span>
          </div>
        </div>
        <div class="mini-note mono">${escapeHtml(complaint.complaint_code || "")}</div>
      </div>
      <p>${escapeHtml(complaint.description)}</p>
      <div class="meta">
        <span>Citizen: ${escapeHtml(complaint.citizen_name || "-")}</span>
        <span>Panchayat: ${escapeHtml(complaint.panchayat_name || "-")}</span>
        <span>Created: ${formatDate(complaint.created_at)}</span>
        ${complaint.last_status_note ? `<span>Note: ${escapeHtml(complaint.last_status_note)}</span>` : ""}
        ${mapLink ? `<span><a href="${mapLink}" target="_blank" rel="noreferrer">Open map</a></span>` : ""}
        ${complaint.proof_image_url ? `<span><a href="${complaint.proof_image_url}" target="_blank" rel="noreferrer">View proof</a></span>` : ""}
      </div>
      ${complaintActionButtons(userRole, complaint)}
    </article>
  `;
}

function complaintList(userRole, complaints, emptyText) {
  if (!complaints?.length) return `<div class="empty">${escapeHtml(emptyText)}</div>`;
  return `<div class="list">${complaints.map((item) => complaintCard(userRole, item)).join("")}</div>`;
}

function complaintForm(draft) {
  return `
    <section class="panel section-panel">
      <div class="section-head"><div><h3>Register a new complaint</h3><p class="muted">Submit once, then track every workflow stage clearly.</p></div><span class="pill-tag">Citizen Desk</span></div>
      <form id="complaint-form" class="form-grid">
        <div class="field"><label for="complaint-title">Complaint title</label><input id="complaint-title" name="title" value="${escapeHtml(draft.title)}" placeholder="Street light not working near ward office" required /></div>
        <div class="field"><label for="complaint-description">Description</label><textarea id="complaint-description" name="description" placeholder="Explain the issue clearly" required>${escapeHtml(draft.description)}</textarea></div>
        <div class="split">
          <div class="field"><label for="complaint-department">Service department</label><select id="complaint-department" name="departmentName" required><option value="">Select a department</option>${DEPARTMENTS.map((department) => `<option value="${department}" ${draft.departmentName === department ? "selected" : ""}>${department}</option>`).join("")}</select></div>
          <div class="field"><label for="complaint-priority">Priority</label><select id="complaint-priority" name="priority" required>${["Low", "Medium", "High", "Critical"].map((priority) => `<option value="${priority}" ${draft.priority === priority ? "selected" : ""}>${priority}</option>`).join("")}</select></div>
        </div>
        <div class="split">
          <div class="field"><label for="complaint-address">Address</label><input id="complaint-address" name="address" value="${escapeHtml(draft.address)}" placeholder="Ward / village / landmark" required /></div>
          <div class="field"><label for="complaint-latitude">Latitude</label><input id="complaint-latitude" name="latitude" value="${escapeHtml(draft.latitude)}" placeholder="21.1458" /></div>
        </div>
        <div class="field"><label for="complaint-longitude">Longitude</label><input id="complaint-longitude" name="longitude" value="${escapeHtml(draft.longitude)}" placeholder="79.0882" /></div>
        <div class="actions"><button class="btn btn-primary" type="submit">Submit complaint</button><button class="btn btn-outline" type="button" data-action="use-location">Use my location</button></div>
      </form>
    </section>
  `;
}

function metricCard(label, value, description) {
  return `<article class="insight-card"><small>${label}</small><strong>${value}</strong><p>${description}</p></article>`;
}

function statusSummary(stat, label) {
  return `<div class="summary-chip"><strong>${stat || 0}</strong><span>${label}</span></div>`;
}

function getFilteredComplaints(complaints = [], filters = {}) {
  const search = (filters.search || "").toLowerCase().trim();
  const filtered = complaints.filter((complaint) => {
    const matchesSearch = !search || [complaint.title, complaint.description, complaint.complaint_code, complaint.citizen_name, complaint.department_name]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(search));
    const matchesPanchayat = !filters.panchayat || complaint.panchayat_name === filters.panchayat;
    const matchesStatus = !filters.status || complaint.status === filters.status;
    return matchesSearch && matchesPanchayat && matchesStatus;
  });
  filtered.sort((left, right) => filters.sort === "oldest" ? new Date(left.created_at) - new Date(right.created_at) : new Date(right.created_at) - new Date(left.created_at));
  return filtered;
}

function getFilteredExportRows(state, workspace) {
  const complaints = workspace?.complaints || [];
  return complaints.filter((item) => {
    const panchayatOk = !state.exportFilters.panchayat || item.panchayat_name === state.exportFilters.panchayat;
    const departmentOk = !state.exportFilters.department || item.department_name === state.exportFilters.department;
    const statusOk = !state.exportFilters.status || item.status === state.exportFilters.status;
    return panchayatOk && departmentOk && statusOk;
  });
}

function complaintHistoryFilters(state, role) {
  const panchayatOptions = role === "district_officer" ? PANCHAYAT_NAMES : [];
  return `
    <section class="panel section-panel filter-panel">
      <div class="section-head"><div><h3>Complaint filters</h3><p class="muted">Search and narrow the records before reviewing them.</p></div><span class="pill-tag">History Tools</span></div>
      <div class="filter-grid">
        <div class="field"><label for="filter-search">Search</label><input id="filter-search" data-filter="search" value="${escapeHtml(state.complaintFilters.search)}" placeholder="Search complaint title or code" /></div>
        ${role === "district_officer" ? `<div class="field"><label for="filter-panchayat">Panchayat</label><select id="filter-panchayat" data-filter="panchayat"><option value="">All panchayats</option>${panchayatOptions.map((name) => `<option value="${name}" ${state.complaintFilters.panchayat === name ? "selected" : ""}>${name}</option>`).join("")}</select></div>` : ""}
        <div class="field"><label for="filter-status">Status</label><select id="filter-status" data-filter="status"><option value="">All status</option>${STATUS_OPTIONS.map((status) => `<option value="${status}" ${state.complaintFilters.status === status ? "selected" : ""}>${status}</option>`).join("")}</select></div>
        <div class="field"><label for="filter-sort">Sort</label><select id="filter-sort" data-filter="sort"><option value="newest" ${state.complaintFilters.sort === "newest" ? "selected" : ""}>Newest first</option><option value="oldest" ${state.complaintFilters.sort === "oldest" ? "selected" : ""}>Oldest first</option></select></div>
      </div>
    </section>
  `;
}

function historyPage(state, workspace) {
  const filtered = getFilteredComplaints(workspace.complaints || [], state.complaintFilters);
  return `<div class="dashboard-grid">${complaintHistoryFilters(state, workspace.user.role)}<section class="panel section-panel"><div class="section-head"><div><h3>Complaint history</h3><p class="muted">${filtered.length} records match your filters.</p></div><span class="pill-tag">Filterable List</span></div>${complaintList(workspace.user.role, filtered, "No complaints match the current filters.")}</section></div>`;
}

function livePage(workspace) {
  const latest = latestComplaints(workspace.complaints || [], 10);
  return `
    <div class="dashboard-grid">
      <section class="hero-card section-panel hero-accent">
        <div class="section-head"><div><h3>Latest complaint stream</h3><p class="muted">Top 10 latest complaints across your current scope, refreshing dynamically.</p></div><span class="pill-tag">Live View</span></div>
        <div class="summary-strip">${statusSummary(latest.length, "Visible Now")}${statusSummary(workspace.stats.submitted, "Submitted")}${statusSummary(workspace.stats.approved, "Approved")}${statusSummary(workspace.stats.acknowledged, "Acknowledged")}</div>
      </section>
      <section class="panel section-panel"><div class="section-head"><div><h3>Top 10 latest complaints</h3><p class="muted">Most recent items first.</p></div><span class="pill-tag">Dynamic Feed</span></div>${complaintList(workspace.user.role, latest, "No latest complaints available.")}</section>
    </div>
  `;
}

function profilePage(workspace) {
  const user = workspace.user;
  return `
    <div class="dashboard-grid">
      <section class="hero-card section-panel hero-accent profile-hero">
        <div class="profile-badge">${escapeHtml((user.full_name || "U").charAt(0).toUpperCase())}</div>
        <div>
          <h3>${escapeHtml(user.full_name)}</h3>
          <p class="muted">${escapeHtml(user.role_label)}</p>
          ${user.panchayat_name ? `<p class="muted">Panchayat: ${escapeHtml(user.panchayat_name)}</p>` : ""}
          ${user.department_name ? `<p class="muted">Department: ${escapeHtml(user.department_name)}</p>` : ""}
        </div>
      </section>
      <div class="page-grid-2">
        <section class="panel section-panel"><div class="section-head"><h3>Identity</h3><span class="pill-tag">Profile</span></div><div class="detail-list"><div><span>Name</span><strong>${escapeHtml(user.full_name)}</strong></div><div><span>Role</span><strong>${escapeHtml(user.role_label)}</strong></div><div><span>Email</span><strong>${escapeHtml(user.email || "-")}</strong></div></div></section>
        <section class="panel section-panel"><div class="section-head"><h3>Access scope</h3><span class="pill-tag">Jurisdiction</span></div><div class="detail-list"><div><span>District</span><strong>${escapeHtml(user.district_name || "Nagpur")}</strong></div><div><span>Panchayat</span><strong>${escapeHtml(user.panchayat_name || "All Panchayats")}</strong></div><div><span>Department</span><strong>${escapeHtml(user.department_name || "All Departments")}</strong></div></div></section>
      </div>
    </div>
  `;
}

function citizenDashboard(workspace, state) {
  return `
    <div class="dashboard-grid">
      ${statsCards(workspace.stats)}
      <div class="card-grid hero-grid">
        ${complaintForm(state.complaintDraft)}
        <section class="hero-card stack section-panel hero-accent">
          <div class="section-head"><div><h3>Your complaint flow</h3><p class="muted">Submit, track, and watch the status update without losing your form.</p></div><span class="pill-tag">Live Tracking</span></div>
          <div class="summary-strip">${statusSummary(workspace.stats.submitted, "Submitted")}${statusSummary(workspace.stats.approved, "Approved")}${statusSummary(workspace.stats.acknowledged, "Acknowledged")}${statusSummary(workspace.stats.resolved, "Resolved")}</div>
          <div class="kpi-grid"><div class="mini-block"><strong>${escapeHtml(workspace.user.panchayat_name)}</strong><span>Panchayat</span></div><div class="mini-block"><strong>Nagpur</strong><span>District</span></div><div class="mini-block"><strong>${workspace.recent_complaints?.length || 0}</strong><span>Visible Records</span></div></div>
        </section>
      </div>
      <section class="panel section-panel"><div class="section-head"><h3>Your complaints</h3><span class="pill-tag">Personal Feed</span></div>${complaintList("citizen", workspace.complaints, "No complaints submitted yet.")}</section>
    </div>
  `;
}

function panchayatDashboard(workspace) {
  const open = toNumber(workspace.stats.submitted) + toNumber(workspace.stats.approved) + toNumber(workspace.stats.acknowledged);
  return `
    <div class="dashboard-grid">
      ${statsCards(workspace.stats)}
      <div class="page-grid-2">
        <section class="panel section-panel"><div class="section-head"><h3>Pending approvals</h3><span class="pill-tag">Action Queue</span></div>${complaintList("panchayat_admin", workspace.pending_complaints, "No complaints are waiting for approval.")}</section>
        <section class="hero-card stack section-panel hero-accent">
          <div class="section-head"><div><h3>${escapeHtml(workspace.user.panchayat_name)} operations</h3><p class="muted">Routing stays locked to the same panchayat and selected service desk.</p></div><span class="pill-tag">Command Desk</span></div>
          <div class="summary-strip">${statusSummary(workspace.stats.submitted, "Waiting")}${statusSummary(workspace.stats.approved, "Forwarded")}${statusSummary(open, "Open")}${statusSummary(workspace.stats.resolved, "Resolved")}</div>
          <div class="mini-note">Departments available in this panchayat: ${DEPARTMENTS.join(", ")}</div>
        </section>
      </div>
      <section class="panel section-panel"><div class="section-head"><h3>All panchayat complaints</h3><span class="pill-tag">Operations Feed</span></div>${complaintList("panchayat_admin", workspace.complaints, "No complaints found for this panchayat.")}</section>
    </div>
  `;
}

function departmentDashboard(workspace) {
  const queue = (workspace.complaints || []).filter((item) => item.status === "Approved");
  const active = (workspace.complaints || []).filter((item) => item.status === "Acknowledged");
  const done = (workspace.complaints || []).filter((item) => item.status === "Resolved");
  return `
    <div class="dashboard-grid">
      ${statsCards(workspace.stats)}
      <section class="hero-card stack section-panel hero-accent">
        <div class="section-head"><div><h3>${escapeHtml(workspace.user.department_name)} workbench</h3><p class="muted">Receive the complaint, complete the work, upload proof, and close it from one place.</p></div><span class="pill-tag">Service Desk</span></div>
        <div class="summary-strip">${statusSummary(queue.length, "To Receive")}${statusSummary(active.length, "In Progress")}${statusSummary(done.length, "Resolved")}${statusSummary(workspace.complaints?.length || 0, "Total Seen")}</div>
        <div class="proof-note">When resolving, upload a proof image. The link stays attached to the complaint record.</div>
      </section>
      <div class="page-grid-2">
        <section class="panel section-panel"><div class="section-head"><h3>Receive queue</h3><span class="pill-tag">Approved</span></div>${complaintList("department_officer", queue, "No newly approved complaints waiting for acknowledgement.")}</section>
        <section class="panel section-panel"><div class="section-head"><h3>Active work</h3><span class="pill-tag">Acknowledged</span></div>${complaintList("department_officer", active, "No complaints are currently in progress.")}</section>
      </div>
    </div>
  `;
}

function districtDashboard(workspace) {
  const open = toNumber(workspace.stats.submitted) + toNumber(workspace.stats.approved) + toNumber(workspace.stats.acknowledged);
  return `
    <div class="dashboard-grid">
      ${statsCards(workspace.stats)}
      <section class="hero-card section-panel hero-accent simple-dashboard-card">
        <div class="section-head"><div><h3>District command summary</h3><p class="muted">Simple district overview with only the top signals you need first.</p></div><span class="pill-tag">Overview</span></div>
        <div class="summary-strip">${statusSummary(workspace.stats.total, "Total")}${statusSummary(open, "Open")}${statusSummary(workspace.stats.resolved, "Resolved")}${statusSummary(workspace.panchayat_summary?.length || 0, "Panchayats")}</div>
      </section>
      <section class="table-wrap section-panel"><div class="section-head"><h3>Panchayat summary snapshot</h3><span class="pill-tag">Snapshot</span></div><table><thead><tr><th>Panchayat</th><th>Total</th><th>Resolved</th><th>Pending</th><th>Rejected</th></tr></thead><tbody>${(workspace.panchayat_summary || []).map((row) => `<tr><td>${escapeHtml(row.panchayat_name)}</td><td>${row.total}</td><td>${row.resolved}</td><td>${row.pending}</td><td>${row.rejected}</td></tr>`).join("")}</tbody></table></section>
    </div>
  `;
}

function getDepartmentBreakdown(complaints = []) {
  const bucket = new Map();
  complaints.forEach((complaint) => {
    const key = complaint.department_name || "Unassigned";
    bucket.set(key, (bucket.get(key) || 0) + 1);
  });
  return [...bucket.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 8);
}

function analyticsPage(workspace) {
  const stats = workspace.stats || {};
  const total = Math.max(1, toNumber(stats.total));
  const resolutionRate = `${Math.round((toNumber(stats.resolved) / total) * 100)}%`;
  const openFlow = toNumber(stats.submitted) + toNumber(stats.approved) + toNumber(stats.acknowledged);
  return `
    <div class="dashboard-grid">
      <section class="panel section-panel analytics-hero-card">
        <div class="section-head"><div><h3>District analytics</h3><p class="muted">Live charts driven by the current complaint dataset.</p></div><span class="pill-tag">Analytics</span></div>
        <div class="insight-grid">${metricCard("Resolution Rate", resolutionRate, "Percent of district complaints already resolved.")}${metricCard("Open Workflow", openFlow, "Records still moving through panchayat or department stages.")}${metricCard("Top Load", getDepartmentBreakdown(workspace.complaints || [])[0]?.label || "-", "Department currently carrying the heaviest complaint load.")}</div>
      </section>
      <section class="analytics-canvases">
        <section class="panel section-panel chart-panel"><div class="section-head"><h3>Status mix</h3><span class="pill-tag">Doughnut</span></div><canvas id="district-status-chart" height="240"></canvas></section>
        <section class="panel section-panel chart-panel"><div class="section-head"><h3>Panchayat performance</h3><span class="pill-tag">Bar</span></div><canvas id="district-panchayat-chart" height="240"></canvas></section>
        <section class="panel section-panel chart-panel chart-panel-wide"><div class="section-head"><h3>Department complaint load</h3><span class="pill-tag">Comparison</span></div><canvas id="district-department-chart" height="170"></canvas></section>
      </section>
    </div>
  `;
}

function settingsPage(state, workspace) {
  const exportRows = getFilteredExportRows(state, workspace);
  return `
    <div class="dashboard-grid">
      <section class="panel section-panel settings-grid">
        <div class="section-head"><div><h3>Settings and export</h3><p class="muted">Download complaint data in Excel-friendly CSV format with filter controls.</p></div><span class="pill-tag">Settings</span></div>
        <div class="filter-grid export-grid">
          <div class="field"><label>Panchayat</label><select data-export-filter="panchayat"><option value="">All panchayats</option>${PANCHAYAT_NAMES.map((name) => `<option value="${name}" ${state.exportFilters.panchayat === name ? "selected" : ""}>${name}</option>`).join("")}</select></div>
          <div class="field"><label>Department</label><select data-export-filter="department"><option value="">All departments</option>${DEPARTMENTS.map((name) => `<option value="${name}" ${state.exportFilters.department === name ? "selected" : ""}>${name}</option>`).join("")}</select></div>
          <div class="field"><label>Status</label><select data-export-filter="status"><option value="">All status</option>${STATUS_OPTIONS.map((name) => `<option value="${name}" ${state.exportFilters.status === name ? "selected" : ""}>${name}</option>`).join("")}</select></div>
          <div class="inner-stat"><small>Rows ready</small><strong>${exportRows.length}</strong></div>
        </div>
        <div class="card-grid hero-grid">
          <section class="panel inner-panel"><h4>Current profile</h4><p class="mini-note">${escapeHtml(workspace.user.full_name)}</p><p class="mini-note">${escapeHtml(workspace.user.role_label)}</p><p class="mini-note">Loaded records: ${workspace.complaints?.length || 0}</p></section>
          <section class="panel inner-panel"><h4>Export data</h4><p class="mini-note">Apply your filters above, then export for Excel.</p><div class="actions"><button class="btn btn-primary" data-action="export-workspace">Download CSV</button></div></section>
        </div>
      </section>
    </div>
  `;
}

function workspaceBody(workspace, state) {
  if (!workspace) return `<section class="panel"><div class="empty">Loading workspace...</div></section>`;
  if (state.activeView === "settings") return settingsPage(state, workspace);
  if (state.activeView === "profile") return profilePage(workspace);
  if (state.activeView === "history") return historyPage(state, workspace);
  if (state.activeView === "live") return livePage(workspace);
  if (state.activeView === "analytics" && workspace.user.role === "district_officer") return analyticsPage(workspace);
  if (workspace.user.role === "citizen") return citizenDashboard(workspace, state);
  if (workspace.user.role === "panchayat_admin") return panchayatDashboard(workspace);
  if (workspace.user.role === "department_officer") return departmentDashboard(workspace);
  return districtDashboard(workspace);
}

function authOptions(publicContext) {
  return (publicContext?.panchayats || []).map((panchayat) => `<option value="${panchayat.id}">${escapeHtml(panchayat.name)} (${escapeHtml(panchayat.district_name)})</option>`).join("");
}

function authView(state) {
  const isLogin = state.authMode === "login";
  return `
    <div class="auth-shell auth-shell-modern">
      <section class="auth-hero auth-hero-modern">
        <div class="landing-stage">
          <div class="landing-copy"><span class="landing-kicker">District grievance operations</span><h1>${APP_NAME}</h1><p>A formal civic interface for Nagpur district, built around panchayat routing, service ownership, and district-level visibility.</p></div>
          <div class="landing-metrics"><div class="landing-metric"><strong>05</strong><span>Panchayats</span></div><div class="landing-metric"><strong>10</strong><span>Departments each</span></div><div class="landing-metric"><strong>01</strong><span>District control room</span></div></div>
        </div>
      </section>
      <section class="auth-panel auth-panel-modern">
        <article class="auth-card section-panel auth-card-modern">
          <div class="auth-tabs"><button class="auth-tab ${isLogin ? "active" : ""}" data-action="switch-auth" data-mode="login">Login</button><button class="auth-tab ${!isLogin ? "active" : ""}" data-action="switch-auth" data-mode="register">Citizen Register</button></div>
          <h2>${isLogin ? "Sign in" : "Create citizen account"}</h2>
          <p class="muted">${isLogin ? "Use your seeded login or your citizen account." : "Registration is limited to citizens. Staff accounts stay controlled from seed data."}</p>
          <form id="auth-form" class="form-grid">
            ${!isLogin ? `<div class="field"><label for="fullName">Full name</label><input id="fullName" name="fullName" required /></div><div class="split"><div class="field"><label for="phone">Phone</label><input id="phone" name="phone" required /></div><div class="field"><label for="panchayatId">Panchayat</label><select id="panchayatId" name="panchayatId" required><option value="">Select panchayat</option>${authOptions(state.publicContext)}</select></div></div>` : ""}
            <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" required /></div>
            <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" required /></div>
            <button class="btn btn-primary" type="submit">${isLogin ? "Login" : "Register and continue"}</button>
          </form>
          <div class="panel login-hint-card"><strong>Starter logins</strong><p class="mini-note mono">district.nagpur@nagpur.local / Nagpur@123</p><p class="mini-note mono">admin.saoner@nagpur.local / Nagpur@123</p><p class="mini-note mono">electricity.saoner@nagpur.local / Nagpur@123</p><p class="mini-note mono">citizen.saoner.1@nagpur.local / Citizen@123</p></div>
        </article>
      </section>
    </div>
  `;
}

export function render(state) {
  const alert = state.notice ? `<div class="alert alert-${state.notice.type === "error" ? "error" : "success"}">${escapeHtml(state.notice.message)}</div>` : "";
  if (!state.session) return `${alert}${authView(state)}`;
  const user = state.workspace?.user || state.session.user;
  const navItems = navItemsForRole(user.role);
  const stats = state.workspace?.stats || {};
  return `
    ${alert}
    <div class="app-shell app-shell-modern">
      <aside class="sidebar sidebar-modern">
        <div class="brand brand-modern"><span class="brand-kicker">Nagpur district</span><h1>${APP_NAME}</h1><p>Formal civic operations workspace</p></div>
        <nav class="menu-stack">${navItems.map(([id, label]) => `<button class="nav-btn ${state.activeView === id ? "active" : ""}" data-action="nav" data-view="${id}">${label}</button>`).join("")}</nav>
        <div class="sidebar-footer"><div class="user-card user-card-modern"><strong>${escapeHtml(user.full_name)}</strong><div class="mini-note">${escapeHtml(user.role_label)}</div>${user.panchayat_name ? `<div class="mini-note">${escapeHtml(user.panchayat_name)}</div>` : ""}${user.department_name ? `<div class="mini-note">${escapeHtml(user.department_name)}</div>` : ""}</div><button class="btn btn-outline" data-action="logout">Logout</button></div>
      </aside>
      <main class="main main-modern">
        <header class="topbar section-panel topbar-card modern-topbar">
          <div class="title-stack"><h2>${escapeHtml(pageTitle(user, state.activeView))}</h2><p>The top numbers and charts update live from Supabase while keeping the current workflow stable.</p></div>
          <div class="topbar-meta"><div class="topbar-user"><strong>${toNumber(stats.total)}</strong><span>Total visible complaints</span></div><button class="btn btn-soft" data-action="refresh">Refresh now</button></div>
        </header>
        ${workspaceBody(state.workspace, state)}
      </main>
    </div>
  `;
}
