// The woods, from soft pine to curly maple. Colours and character are hand-set approximations:
// planed colour (early and late wood), how far apart the growth rings run, how open the pores are,
// and how readily the grain tears out when it's planed the wrong way (0 never, 1 always).
// hard sets the pitch of the plane's sound: harder woods sing a little higher.

export const WOODS = {
  pine: {
    name: 'Pine', early: '#ecd3a2', late: '#cf9b5c', rough: '#c9b393',
    ring: 7, contrast: 0.85, pores: 0, rays: 0, tear: 0.22, hard: 0.15,
    note: 'Soft and forgiving. It fuzzes more than it tears.',
  },
  poplar: {
    name: 'Poplar', early: '#ddd4aa', late: '#bfb588', rough: '#c3bb9c', streak: '#a7a97c',
    ring: 5, contrast: 0.45, pores: 0, rays: 0, tear: 0.28, hard: 0.3,
    note: 'Plain, even and easy to plane, with a green streak or two.',
  },
  ash: {
    name: 'Ash', early: '#e4d1a8', late: '#b48f61', rough: '#c7b89c',
    ring: 4.5, contrast: 0.8, pores: 0.7, rays: 0, tear: 0.36, hard: 0.55,
    note: 'Bold rings. Hard early wood beside soft late wood.',
  },
  redoak: {
    name: 'Red oak', early: '#d4a67c', late: '#a6714c', rough: '#bfa287',
    ring: 4, contrast: 0.85, pores: 0.9, rays: 0.25, tear: 0.42, hard: 0.6,
    note: 'Open pores and coarse grain. Read it before you plane it.',
  },
  cherry: {
    name: 'Cherry', early: '#cd8d63', late: '#ab6a43', rough: '#b7967c',
    ring: 3.2, contrast: 0.45, pores: 0, rays: 0, tear: 0.44, hard: 0.5,
    note: 'Fine and close-grained, and it shows every plane track.',
  },
  walnut: {
    name: 'Walnut', early: '#7e5d45', late: '#5b402e', rough: '#8b765f', sap: '#d8c19f',
    ring: 3.5, contrast: 0.6, pores: 0.35, rays: 0, tear: 0.38, hard: 0.5,
    note: 'Dark, with a pale stripe of sapwood along one edge.',
  },
  mahogany: {
    name: 'Mahogany', early: '#b4633f', late: '#8f4a2e', rough: '#a68673',
    ring: 6, contrast: 0.35, pores: 0.25, rays: 0, tear: 0.6, hard: 0.45,
    note: 'Interlocked grain: stripes down the board run opposite ways.',
  },
  whiteoak: {
    name: 'White oak', early: '#cfaf80', late: '#9f8159', rough: '#b9a285',
    ring: 3.6, contrast: 0.7, pores: 0.6, rays: 0.8, tear: 0.5, hard: 0.7,
    note: 'Quartersawn, with ray fleck that likes to lift.',
  },
  maple: {
    name: 'Hard maple', early: '#ecdbbb', late: '#d5bd95', rough: '#cbbca3',
    ring: 2.2, contrast: 0.4, pores: 0, rays: 0, tear: 0.55, hard: 0.85,
    note: 'Hard and dense. It tears out at the first wrong move.',
  },
  curly: {
    name: 'Curly maple', early: '#edd5a6', late: '#d6b680', rough: '#ccbb9f',
    ring: 2.4, contrast: 0.35, pores: 0, rays: 0, tear: 0.9, hard: 0.9, curl: 1,
    note: 'The curl reverses every inch or so. Only a fine cut gets through it clean.',
  },
};

export const WOOD_IDS = Object.keys(WOODS);

// '#rrggbb' to [r, g, b].
export function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
