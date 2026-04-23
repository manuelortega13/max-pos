/**
 * Dev-mode environment. Leaves apiBaseUrl empty so relative /api/* calls
 * keep flowing through proxy.conf.json to the local Spring Boot server.
 * The production build swaps this file out via angular.json file
 * replacements — see environment.prod.ts.
 */
export const environment = {
  production: false,
  apiBaseUrl: '',
};
