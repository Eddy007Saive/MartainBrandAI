import api from '../lib/api';

export const analyticsService = {
  getStats: () =>
    api.get('/analytics/stats').then(r => r.data),

  getPerformance: () =>
    api.get('/analytics/performance').then(r => r.data),
};
