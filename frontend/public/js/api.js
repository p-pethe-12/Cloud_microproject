import { supabase } from "./supabase.js";

async function rpc(fn, params = {}) {
  const { data, error } = await supabase.rpc(fn, params);
  if (error) throw new Error(error.message || "Supabase request failed");
  return data;
}

export function fetchPublicContext() {
  return rpc("app_public_bootstrap");
}

export function signIn(email, password) {
  return rpc("app_sign_in", { p_email: email, p_password: password });
}

export function registerCitizen(payload) {
  return rpc("app_register_citizen", {
    p_full_name: payload.fullName,
    p_email: payload.email,
    p_password: payload.password,
    p_phone: payload.phone,
    p_panchayat_id: payload.panchayatId,
  });
}

export function getSession(token) {
  return rpc("app_get_session", { p_token: token });
}

export function signOut(token) {
  return rpc("app_sign_out", { p_token: token });
}

export function getWorkspace(token) {
  return rpc("app_get_workspace", { p_token: token });
}

export function createComplaint(token, payload) {
  return rpc("app_create_complaint", {
    p_token: token,
    p_title: payload.title,
    p_description: payload.description,
    p_priority: payload.priority,
    p_department_name: payload.departmentName,
    p_address: payload.address,
    p_latitude: payload.latitude ? Number(payload.latitude) : null,
    p_longitude: payload.longitude ? Number(payload.longitude) : null,
  });
}

export async function uploadProofImage(file, complaintId) {
  const safeName = `${complaintId}-${Date.now()}-${file.name}`.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `proofs/${safeName}`;
  const { error } = await supabase.storage.from("complaint-proofs").upload(path, file, {
    cacheControl: "3600",
    upsert: true,
  });
  if (error) throw new Error(error.message || "Proof image upload failed");
  const { data } = supabase.storage.from("complaint-proofs").getPublicUrl(path);
  return data.publicUrl;
}

export function takeComplaintAction(token, complaintId, action, note = null, departmentName = null, proofImageUrl = null) {
  return rpc("app_take_complaint_action", {
    p_token: token,
    p_complaint_id: complaintId,
    p_action: action,
    p_note: note,
    p_department_name: departmentName,
    p_proof_image_url: proofImageUrl,
  });
}

