export const DEALERS = {
  kyle: {
    id: 'kyle',
    name: 'Kyle',
    level: 0,
    chipColor: '#4CAF50',
    chipTextColor: '#fff',
  },
  diane: {
    id: 'diane',
    name: 'Diane',
    level: 1,
    chipColor: '#E57373',
    chipTextColor: '#fff',
  },
  marco: {
    id: 'marco',
    name: 'Marco',
    level: 2,
    chipColor: '#D32F2F',
    chipTextColor: '#fff',
  },
  voss: {
    id: 'voss',
    name: 'Prof. Voss',
    level: 3,
    chipColor: '#7B1FA2',
    chipTextColor: '#fff',
  },
  sable: {
    id: 'sable',
    name: 'Sable',
    level: 4,
    chipColor: '#78909C',
    chipTextColor: '#fff',
  },
  inferno: {
    id: 'inferno',
    name: 'Mr. Inferno',
    level: 5,
    chipColor: '#1a1a1a',
    chipTextColor: '#DAA520',
    chipRimColor: '#DAA520',
  },
}

export const LEVEL_TO_DEALER = ['kyle', 'diane', 'marco', 'voss', 'sable', 'inferno']

export function getDealerForLevel(level) {
  return DEALERS[LEVEL_TO_DEALER[level]] || DEALERS.kyle
}
