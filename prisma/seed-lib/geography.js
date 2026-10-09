export const provinces = Object.freeze(
  [
    'Western',
    'Central',
    'Southern',
    'Northern',
    'Eastern',
    'North Western',
    'North Central',
    'Uva',
    'Sabaragamuwa',
  ].map((name, index) => Object.freeze({ province_id: index + 1, name })),
);

// province, district, name, centre lat/lon, first substation, count,
// installation count, first site, last site: exact project.md §6.3 order.
const rows = [
  [1, 1, 'Colombo', 6.9271, 79.8612, 1, 3, 32, 1, 32],
  [1, 2, 'Gampaha', 7.0873, 79.9925, 4, 2, 24, 33, 56],
  [1, 3, 'Kalutara', 6.5854, 79.9607, 6, 1, 12, 57, 68],
  [2, 4, 'Kandy', 7.2906, 80.6337, 7, 2, 20, 69, 88],
  [2, 5, 'Matale', 7.4675, 80.6234, 9, 1, 7, 89, 95],
  [2, 6, 'Nuwara Eliya', 6.9497, 80.7891, 10, 1, 6, 96, 101],
  [3, 7, 'Galle', 6.0535, 80.221, 11, 1, 14, 102, 115],
  [3, 8, 'Matara', 5.9549, 80.555, 12, 1, 10, 116, 125],
  [3, 9, 'Hambantota', 6.1241, 81.1185, 13, 1, 8, 126, 133],
  [4, 10, 'Jaffna', 9.6615, 80.0255, 14, 1, 9, 134, 142],
  [4, 11, 'Kilinochchi', 9.3803, 80.377, 15, 1, 4, 143, 146],
  [4, 12, 'Mannar', 8.981, 79.9044, 16, 1, 3, 147, 149],
  [4, 13, 'Vavuniya', 8.7514, 80.4971, 17, 1, 4, 150, 153],
  [4, 14, 'Mullaitivu', 9.2671, 80.8142, 18, 1, 3, 154, 156],
  [5, 15, 'Batticaloa', 7.7102, 81.6924, 19, 1, 7, 157, 163],
  [5, 16, 'Ampara', 7.2975, 81.682, 20, 1, 8, 164, 171],
  [5, 17, 'Trincomalee', 8.5874, 81.2152, 21, 1, 6, 172, 177],
  [6, 18, 'Kurunegala', 7.4863, 80.3647, 22, 2, 15, 178, 192],
  [6, 19, 'Puttalam', 8.0362, 79.8283, 24, 1, 8, 193, 200],
  [7, 20, 'Anuradhapura', 8.3114, 80.4037, 25, 1, 9, 201, 209],
  [7, 21, 'Polonnaruwa', 7.9403, 81.0188, 26, 1, 5, 210, 214],
  [8, 22, 'Badulla', 6.9934, 81.055, 27, 1, 7, 215, 221],
  [8, 23, 'Monaragala', 6.8728, 81.3507, 28, 1, 5, 222, 226],
  [9, 24, 'Ratnapura', 6.7056, 80.3847, 29, 1, 8, 227, 234],
  [9, 25, 'Kegalle', 7.2513, 80.3464, 30, 1, 6, 235, 240],
];

export const districts = Object.freeze(
  rows.map(
    ([
      province_id,
      district_id,
      name,
      latitude,
      longitude,
      substationStart,
      substationCount,
      installationCount,
      siteStart,
      siteEnd,
    ]) =>
      Object.freeze({
        province_id,
        district_id,
        name,
        latitude,
        longitude,
        substationStart,
        substationCount,
        installationCount,
        siteStart,
        siteEnd,
      }),
  ),
);
