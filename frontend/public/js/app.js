import { createComplaint, fetchPublicContext, getSession, getWorkspace, registerCitizen, signIn, signOut, takeComplaintAction, uploadProofImage } from "./api.js";
import { POLL_INTERVAL_MS, SESSION_KEY } from "./config.js";
import { startPolling, stopPolling } from "./polling.js";
import { clearNotice, setNotice, state } from "./state.js";
import { render } from "./views.js";

const root = document.getElementById("app");
const charts = {};

function isComplaintFormActive() {
  const active = document.activeElement;
  return Boolean(active && active.closest && active.closest("#complaint-form"));
}

function destroyCharts() {
  Object.values(charts).forEach((chart) => chart?.destroy?.());
  Object.keys(charts).forEach((key) => delete charts[key]);
}

function renderDistrictCharts() {
  if (!state.workspace || state.workspace.user.role !== "district_officer" || state.activeView !== "analytics") return;
  if (!window.Chart) return;

  const stats = state.workspace.stats || {};
  const summary = state.workspace.panchayat_summary || [];
  const complaints = state.workspace.complaints || [];
  const departmentMap = new Map();
  complaints.forEach((item) => {
    const key = item.department_name || "Unassigned";
    departmentMap.set(key, (departmentMap.get(key) || 0) + 1);
  });
  const departments = [...departmentMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  const statusCanvas = document.getElementById("district-status-chart");
  const panchayatCanvas = document.getElementById("district-panchayat-chart");
  const departmentCanvas = document.getElementById("district-department-chart");

  if (statusCanvas) {
    charts.status = new Chart(statusCanvas, {
      type: "doughnut",
      data: {
        labels: ["Submitted", "Approved", "Acknowledged", "Resolved", "Rejected"],
        datasets: [{
          data: [stats.submitted || 0, stats.approved || 0, stats.acknowledged || 0, stats.resolved || 0, stats.rejected || 0],
          backgroundColor: ["#f59e0b", "#3b82f6", "#1d4ed8", "#059669", "#dc2626"],
          borderWidth: 0,
        }],
      },
      options: { plugins: { legend: { position: "bottom" } } },
    });
  }

  if (panchayatCanvas) {
    charts.panchayat = new Chart(panchayatCanvas, {
      type: "bar",
      data: {
        labels: summary.map((item) => item.panchayat_name),
        datasets: [{
          label: "Resolved complaints",
          data: summary.map((item) => item.resolved || 0),
          backgroundColor: "#059669",
          borderRadius: 10,
        }],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } },
      },
    });
  }

  if (departmentCanvas) {
    charts.department = new Chart(departmentCanvas, {
      type: "bar",
      data: {
        labels: departments.map(([label]) => label),
        datasets: [{
          label: "Complaints",
          data: departments.map(([, value]) => value),
          backgroundColor: "#175cd3",
          borderRadius: 10,
        }],
      },
      options: {
        indexAxis: "y",
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true } },
      },
    });
  }
}

function paint() {
  destroyCharts();
  root.innerHTML = render(state);
  renderDistrictCharts();
}

function saveSessionToken(token) {
  state.sessionToken = token || "";
  if (token) localStorage.setItem(SESSION_KEY, token);
  else localStorage.removeItem(SESSION_KEY);
}

function resetComplaintDraft() {
  state.complaintDraft = {
    title: "",
    description: "",
    departmentName: "",
    priority: "Medium",
    address: "",
    latitude: "",
    longitude: "",
  };
}

function updateComplaintDraftFromForm(form) {
  if (!form) return;
  state.complaintDraft = {
    title: form.title?.value || "",
    description: form.description?.value || "",
    departmentName: form.departmentName?.value || "",
    priority: form.priority?.value || "Medium",
    address: form.address?.value || "",
    latitude: form.latitude?.value || "",
    longitude: form.longitude?.value || "",
  };
}

async function loadPublicContext() {
  state.publicContext = await fetchPublicContext();
}

async function refreshWorkspace(showMessage = false) {
  if (!state.sessionToken) return;
  state.workspace = await getWorkspace(state.sessionToken);
  state.session = { token: state.sessionToken, user: state.workspace.user };
  if (showMessage) setNotice("success", "Dashboard refreshed.");
}

async function restoreSession() {
  if (!state.sessionToken) return;
  try {
    const session = await getSession(state.sessionToken);
    state.session = session;
    await refreshWorkspace();
  } catch {
    saveSessionToken("");
    state.session = null;
  }
}

async function handleAuthSubmit(formData) {
  if (state.authMode === "login") {
    const result = await signIn(formData.get("email"), formData.get("password"));
    saveSessionToken(result.token);
    state.session = result;
    state.activeView = "dashboard";
    await refreshWorkspace();
    setNotice("success", `Welcome back, ${result.user.full_name}.`);
    return;
  }

  const result = await registerCitizen({
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
    panchayatId: formData.get("panchayatId"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  saveSessionToken(result.token);
  state.session = result;
  state.activeView = "dashboard";
  await refreshWorkspace();
  setNotice("success", "Citizen account created successfully.");
}

async function handleComplaintSubmit(form) {
  updateComplaintDraftFromForm(form);
  state.isSubmittingComplaint = true;
  try {
    await createComplaint(state.sessionToken, { ...state.complaintDraft });
    resetComplaintDraft();
    setNotice("success", "Complaint sent to your panchayat successfully.");
    await refreshWorkspace();
  } finally {
    state.isSubmittingComplaint = false;
  }
}

function getResolveElements(button) {
  const container = button.closest(".resolve-box");
  return {
    note: container?.querySelector("textarea")?.value || "",
    file: container?.querySelector('input[type="file"]')?.files?.[0] || null,
  };
}

function formatCsvValue(value) {
  const stringValue = String(value ?? "").replaceAll('"', '""');
  return `"${stringValue}"`;
}

function getFilteredExportRows() {
  const complaints = state.workspace?.complaints || [];
  return complaints.filter((item) => {
    const panchayatOk = !state.exportFilters.panchayat || item.panchayat_name === state.exportFilters.panchayat;
    const departmentOk = !state.exportFilters.department || item.department_name === state.exportFilters.department;
    const statusOk = !state.exportFilters.status || item.status === state.exportFilters.status;
    return panchayatOk && departmentOk && statusOk;
  });
}

function downloadWorkspaceCsv() {
  const rows = getFilteredExportRows();
  const header = ["Complaint Code", "Title", "Panchayat", "Department", "Citizen", "Status", "Priority", "Created At", "Address", "Last Note"];
  const csv = [header.join(",")]
    .concat(rows.map((item) => [
      item.complaint_code,
      item.title,
      item.panchayat_name,
      item.department_name,
      item.citizen_name,
      item.status,
      item.priority,
      item.created_at,
      item.address,
      item.last_status_note,
    ].map(formatCsvValue).join(",")))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `complaints-export-${Date.now()}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function handleAction(button) {
  const action = button.dataset.action;

  if (action === "switch-auth") {
    state.authMode = button.dataset.mode;
    clearNotice();
    paint();
    return;
  }

  if (action === "nav") {
    state.activeView = button.dataset.view || "dashboard";
    paint();
    return;
  }

  if (action === "logout") {
    stopPolling();
    if (state.sessionToken) {
      try { await signOut(state.sessionToken); } catch {}
    }
    saveSessionToken("");
    state.session = null;
    state.workspace = null;
    resetComplaintDraft();
    state.activeView = "dashboard";
    setNotice("success", "You have been logged out.");
    paint();
    return;
  }

  if (action === "refresh") {
    await refreshWorkspace(true);
    paint();
    return;
  }

  if (action === "export-workspace") {
    downloadWorkspaceCsv();
    setNotice("success", "Complaint export downloaded as CSV. You can open it in Excel.");
    paint();
    return;
  }

  if (action === "use-location") {
    if (!navigator.geolocation) throw new Error("Geolocation is not available in this browser.");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        state.complaintDraft.latitude = position.coords.latitude.toFixed(6);
        state.complaintDraft.longitude = position.coords.longitude.toFixed(6);
        setNotice("success", "Current location captured.");
        paint();
      },
      () => {
        setNotice("error", "Unable to read your location.");
        paint();
      }
    );
    return;
  }

  if (["approve", "reject", "acknowledge", "resolve"].includes(action)) {
    let note = null;
    let proofImageUrl = null;

    if (action === "resolve") {
      const fields = getResolveElements(button);
      note = fields.note || null;
      if (!fields.file) throw new Error("Please upload a proof photo before marking the complaint resolved.");
      proofImageUrl = await uploadProofImage(fields.file, button.dataset.id);
    } else {
      const notePrompt = {
        approve: "Optional note for approval",
        reject: "Reason for rejection",
        acknowledge: "Optional acknowledgement note",
      }[action];
      note = window.prompt(notePrompt, "") || null;
    }

    const departmentName = action === "approve" ? button.dataset.department || null : null;
    await takeComplaintAction(state.sessionToken, button.dataset.id, action, note, departmentName, proofImageUrl);
    setNotice("success", `Complaint ${action} action saved.`);
    await refreshWorkspace();
    paint();
  }
}

function handleError(error) {
  setNotice("error", error.message || "Something went wrong.");
  paint();
}

document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  clearNotice();
  try {
    if (form.id === "auth-form") {
      await handleAuthSubmit(new FormData(form));
      startPolling(async () => {
        try {
          await refreshWorkspace();
          if (!isComplaintFormActive() && !state.isSubmittingComplaint) paint();
        } catch (error) {
          handleError(error);
        }
      }, POLL_INTERVAL_MS);
    }
    if (form.id === "complaint-form") await handleComplaintSubmit(form);
    paint();
  } catch (error) {
    handleError(error);
  }
});

document.addEventListener("input", (event) => {
  const form = event.target.closest && event.target.closest("#complaint-form");
  if (form) updateComplaintDraftFromForm(form);

  const filterKey = event.target.dataset?.filter;
  if (filterKey) {
    state.complaintFilters[filterKey] = event.target.value;
    paint();
  }

  const exportKey = event.target.dataset?.exportFilter;
  if (exportKey) state.exportFilters[exportKey] = event.target.value;
});

document.addEventListener("change", (event) => {
  const form = event.target.closest && event.target.closest("#complaint-form");
  if (form) updateComplaintDraftFromForm(form);

  const filterKey = event.target.dataset?.filter;
  if (filterKey) {
    state.complaintFilters[filterKey] = event.target.value;
    paint();
  }

  const exportKey = event.target.dataset?.exportFilter;
  if (exportKey) state.exportFilters[exportKey] = event.target.value;
});

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  try {
    await handleAction(button);
  } catch (error) {
    handleError(error);
  }
});

async function bootstrap() {
  try {
    await loadPublicContext();
    await restoreSession();
    if (state.sessionToken) {
      startPolling(async () => {
        try {
          await refreshWorkspace();
          if (!isComplaintFormActive() && !state.isSubmittingComplaint) paint();
        } catch (error) {
          handleError(error);
        }
      }, POLL_INTERVAL_MS);
    }
  } catch (error) {
    handleError(error);
  }
  paint();
}

bootstrap();
