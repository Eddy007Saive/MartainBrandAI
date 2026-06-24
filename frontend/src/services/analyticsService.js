import api from '../lib/api';

export const analyticsService = {
  getStats: () =>
    api.get('/analytics/stats').then(r => r.data),

  getPerformance: () =>
    api.get('/analytics/performance').then(r => r.data),

  // Performances réelles depuis Late (analytics add-on requis)
  insights: (days = 30, platform) =>
    api.get('/analytics/insights', { params: { days, ...(platform ? { platform } : {}) } }).then(r => r.data),
};
