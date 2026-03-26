import api from '../lib/api';

export const scheduleService = {
  getAll: () =>
    api.get('/users/me/schedules').then(r => r.data),

  save: (schedules) =>
    api.put('/users/me/schedules', { schedules }).then(r => r.data),
};
