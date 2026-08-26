import { Request, Response, Router } from 'express';
import { ApiResponse } from '@common/utils/ApiResponse';
import { getDiagnosticsSnapshot, resetDiagnostics } from './DiagnosticsCollector';

export class DiagnosticsController {
  router = Router();

  constructor() {
    this.router.get('/api/diagnostics', this.get);
    // Zerowanie licznikow przed oknem pomiaru — wolane przez run_single.sh
    // po fazie rozgrzewki. Odpowiednik w apps/functional/src/common/shell/
    // routes/diagnostics.ts musi pozostac identyczny.
    this.router.post('/api/diagnostics/reset', this.reset);
  }

  private get = (_req: Request, res: Response): void => {
    res.json(ApiResponse.success(getDiagnosticsSnapshot(), 'Diagnostics'));
  };

  private reset = (_req: Request, res: Response): void => {
    resetDiagnostics();
    res.json(ApiResponse.success(getDiagnosticsSnapshot(), 'Diagnostics reset'));
  };
}
