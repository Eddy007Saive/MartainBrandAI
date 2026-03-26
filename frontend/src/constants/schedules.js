export const FREQUENCIES = [
  { value: 'daily', label: 'Tous les jours' },
  { value: '3_per_week', label: '3 fois par semaine' },
  { value: 'weekly', label: '1 fois par semaine' },
  { value: 'biweekly', label: '1 fois toutes les 2 semaines' },
  { value: 'custom', label: 'Personnalisé' },
];

export const DAYS = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mer' },
  { value: 4, label: 'Jeu' },
  { value: 5, label: 'Ven' },
  { value: 6, label: 'Sam' },
  { value: 0, label: 'Dim' },
];

export const DEFAULT_SCHEDULE = {
  frequency: 'weekly',
  days_of_week: [],
  preferred_time: '09:00',
  is_active: false,
};
