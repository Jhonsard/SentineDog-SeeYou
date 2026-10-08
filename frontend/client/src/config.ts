// Configuration centralisée de l'application
// Utiliser l'adresse IP du serveur pour l'accès externe
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://seeyou-87vn.onrender.com";
export const API_VERSION = "v1";

export const API_ENDPOINTS = {
  BASE: `${API_BASE_URL}/api/${API_VERSION}`,
  AUTH: {
    TOKEN: `${API_BASE_URL}/api/${API_VERSION}/auth/token`,
    ME: `${API_BASE_URL}/api/${API_VERSION}/auth/me`,
  },
  ALERTS: {
    HISTORY: `${API_BASE_URL}/api/${API_VERSION}/alerts/history`,
    BANNED_HOSTS: `${API_BASE_URL}/api/${API_VERSION}/alerts/banned-hosts`,
    VALIDATE_BLOCK: (alertId: number) => `${API_BASE_URL}/api/${API_VERSION}/alerts/${alertId}/validate-block`,
    UNBAN: (alertId: number) => `${API_BASE_URL}/api/${API_VERSION}/alerts/${alertId}/unban`,
    STATS_HISTORY: `${API_BASE_URL}/api/${API_VERSION}/alerts/stats/history`,
  },
  EMAIL: {
    CONFIG: `${API_BASE_URL}/api/${API_VERSION}/email/config`,
    TEST: `${API_BASE_URL}/api/${API_VERSION}/email/test`,
  },
  NODES: {
    HIERARCHY: `${API_BASE_URL}/api/${API_VERSION}/nodes/hierarchy`,
    STATS_AGGREGATED: `${API_BASE_URL}/api/${API_VERSION}/nodes/stats/aggregated`,
    CHECK_ALL: `${API_BASE_URL}/api/${API_VERSION}/nodes/check-all`,
    CHECK: (nodeId: number) => `${API_BASE_URL}/api/${API_VERSION}/nodes/${nodeId}/check`,
    LIST: `${API_BASE_URL}/api/${API_VERSION}/nodes/nodes`,
    CREATE: `${API_BASE_URL}/api/${API_VERSION}/nodes/nodes`,
    UPDATE: (nodeId: number) => `${API_BASE_URL}/api/${API_VERSION}/nodes/${nodeId}`,
    DELETE: (nodeId: number) => `${API_BASE_URL}/api/${API_VERSION}/nodes/${nodeId}`,
    MONITOR_START: (nodeId: number) => `${API_BASE_URL}/api/${API_VERSION}/nodes/${nodeId}/monitor/start`,
    MONITOR_STOP: (nodeId: number) => `${API_BASE_URL}/api/${API_VERSION}/nodes/${nodeId}/monitor/stop`,
    CAMPUSES: `${API_BASE_URL}/api/${API_VERSION}/nodes/campuses`,
    CAMPUS_DETAIL: (campusId: number) => `${API_BASE_URL}/api/${API_VERSION}/nodes/campuses/${campusId}`,
    DEPARTMENTS: `${API_BASE_URL}/api/${API_VERSION}/nodes/departments`,
    DEPARTMENT_DETAIL: (deptId: number) => `${API_BASE_URL}/api/${API_VERSION}/nodes/departments/${deptId}`,
  },
  AI: {
    DECIDE: `${API_BASE_URL}/api/${API_VERSION}/ai/decide`,
    FEEDBACK: `${API_BASE_URL}/api/${API_VERSION}/ai/feedback`,
    RELOAD: `${API_BASE_URL}/api/${API_VERSION}/ai/reload`,
    STATUS: `${API_BASE_URL}/api/${API_VERSION}/ai/status`,
    ALIGNMENT: `${API_BASE_URL}/api/${API_VERSION}/ai/alignment`,
    MODE: `${API_BASE_URL}/api/${API_VERSION}/ai/mode`,
  },
  KEYS: {
    ROTATE: `${API_BASE_URL}/api/${API_VERSION}/keys/rotate`,
    CURRENT: `${API_BASE_URL}/api/${API_VERSION}/keys/current`,
  },
  WEBSOCKET: {
    ALERTS: `ws://${API_BASE_URL.replace("http://", "").replace("https://", "")}/api/${API_VERSION}/alerts/ws/alerts`,
  },
} as const;
