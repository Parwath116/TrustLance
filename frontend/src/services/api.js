// API Client for TrustLance Backend

const API_BASE = "/api";

async function request(endpoint, options = {}) {
  const token = localStorage.getItem("trustlance_token");
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    localStorage.removeItem("trustlance_token");
    window.dispatchEvent(new CustomEvent("trustlance_unauthorized"));
  }

  let data = null;
  const contentType = res.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    data = await res.json();
  }

  if (!res.ok) {
    const errorMsg = data?.error || `HTTP ${res.status}: ${res.statusText}`;
    const err = new Error(errorMsg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

export const api = {
  // Auth
  async getNonce(address) {
    return request(`/auth/nonce/${address}`);
  },

  async verifySignature(address, signature) {
    return request("/auth/verify", {
      method: "POST",
      body: JSON.stringify({ address, signature }),
    });
  },

  // Jobs
  async getJobs(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== "") {
        query.append(key, val);
      }
    });
    const qs = query.toString();
    return request(`/jobs${qs ? `?${qs}` : ""}`);
  },

  async getJob(onchainId) {
    return request(`/jobs/${onchainId}`);
  },

  async uploadJobMetadata(onchainId, metadataRaw) {
    return request(`/jobs/${onchainId}/metadata`, {
      method: "POST",
      body: JSON.stringify({ metadataRaw }),
    });
  },

  // Messages (Chat)
  async getMessages(onchainId) {
    return request(`/jobs/${onchainId}/messages`);
  },

  async sendMessage(onchainId, text) {
    return request(`/jobs/${onchainId}/messages`, {
      method: "POST",
      body: JSON.stringify({ text }),
    });
  },

  // User profiles
  async getUserProfile(address) {
    return request(`/users/${address}`);
  },

  async updateUserProfile(address, profileData) {
    return request(`/users/${address}`, {
      method: "PUT",
      body: JSON.stringify(profileData),
    });
  },

  // Notifications
  async getNotifications() {
    return request("/notifications");
  },

  async markNotificationRead(id) {
    return request(`/notifications/${id}/read`, {
      method: "PATCH",
    });
  },
};
