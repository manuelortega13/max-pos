import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

/**
 * Prefixes every `/api/*` request with the environment's `apiBaseUrl`.
 *
 * In dev `apiBaseUrl` is empty, so calls stay relative and the Angular
 * dev-server proxy (proxy.conf.json) forwards them to localhost:8011.
 * In prod the Vercel-hosted frontend hits the Render-hosted backend
 * directly via an absolute URL, which keeps CORS behavior explicit and
 * sidesteps Vercel's edge-proxy limits around long-lived SSE streams.
 *
 * Runs after authInterceptor so that `req.url.startsWith('/api/')` in the
 * auth pass still sees the relative path and stamps the bearer token.
 */
export const apiBaseUrlInterceptor: HttpInterceptorFn = (req, next) => {
  if (!environment.apiBaseUrl || !req.url.startsWith('/api/')) {
    return next(req);
  }
  return next(req.clone({ url: environment.apiBaseUrl + req.url }));
};
