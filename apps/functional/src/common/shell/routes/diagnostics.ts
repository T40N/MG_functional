import { Express, Request, Response } from 'express';
import { createResponse } from '@common/core/usecases/createResponse';
import { getDiagnosticsSnapshot, resetDiagnostics } from '../diagnostics/collector';

export const registerDiagnosticsRoute = (app: Express): void => {
  app.get('/api/diagnostics', (_req: Request, res: Response) => {
    res.json(createResponse('success', getDiagnosticsSnapshot(), 'Diagnostics'));
  });

  // Zerowanie licznikow przed oknem pomiaru — wolane przez run_single.sh
  // po fazie rozgrzewki. Odpowiednik w apps/oop/src/common/diagnostics/
  // DiagnosticsController.ts musi pozostac identyczny.
  app.post('/api/diagnostics/reset', (_req: Request, res: Response) => {
    resetDiagnostics();
    res.json(createResponse('success', getDiagnosticsSnapshot(), 'Diagnostics reset'));
  });
};
