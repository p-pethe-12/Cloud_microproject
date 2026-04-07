export const state = {
  authMode: "login",
  loading: false,
  sessionToken: localStorage.getItem("panchayat_custom_session") || "",
  session: null,
  publicContext: null,
  workspace: null,
  notice: null,
  activeView: "dashboard",
  complaintDraft: {
    title: "",
    description: "",
    departmentName: "",
    priority: "Medium",
    address: "",
    latitude: "",
    longitude: "",
  },
  isSubmittingComplaint: false,
  complaintFilters: {
    search: "",
    panchayat: "",
    status: "",
    sort: "newest",
  },
  exportFilters: {
    panchayat: "",
    department: "",
    status: "",
  },
};

export function setNotice(type, message) {
  state.notice = message ? { type, message } : null;
}

export function clearNotice() {
  state.notice = null;
}
