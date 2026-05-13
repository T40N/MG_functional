/**
 * Returns k6 options for the given load profile (A/B/C/D).
 * Used via:  export const options = getOptions(__ENV.PROFILE || 'A');
 */
export function getOptions(profile) {
  switch (profile) {
    case 'B':
      return {
        thresholds: { http_req_failed: ['rate < 0.05'] },
        stages: [
          { duration: '30s', target: 20 },
          { duration: '2m',  target: 20 },
          { duration: '30s', target: 0  },
        ],
      };

    case 'C':
      return {
        thresholds: { http_req_failed: ['rate < 0.05'] },
        stages: [
          { duration: '1m', target: 100 },
          { duration: '3m', target: 100 },
          { duration: '1m', target: 0   },
        ],
      };

    case 'D':
      return {
        thresholds: {
          http_req_failed:            ['rate < 0.01'],
          'http_req_duration{p(95)}': ['< 500'],
        },
        stages: [
          { duration: '2m', target: 200 },
          { duration: '5m', target: 200 },
          { duration: '2m', target: 0   },
        ],
      };

    default: // 'A' — baseline, single VU
      return {
        thresholds: { http_req_failed: ['rate < 0.05'] },
        vus:      1,
        duration: '30s',
      };
  }
}
