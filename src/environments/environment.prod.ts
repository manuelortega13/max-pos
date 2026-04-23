/**
 * Production environment, swapped in by angular.json fileReplacements on
 * `ng build --configuration production`. Update apiBaseUrl to the Render
 * URL of the deployed Spring Boot server (no trailing slash).
 *
 * Also remember to set MAXPOS_CORS_ALLOWED_ORIGINS on the backend to the
 * Vercel URL that will be sending these requests, or CORS will reject them.
 */
export const environment = {
  production: true,
  apiBaseUrl: 'https://maxpos-server.onrender.com',
};
