import { Request, Response, Router } from 'express';
import { ApiResponse } from '@common/utils/ApiResponse';
import { getDiagnosticsSnapshot } from './DiagnosticsCollector';

export class DiagnosticsController {
  router = Router();

  constructor() {
    this.router.get('/api/diagnostics', this.get);
  }

  private get = (_req: Request, res: Response): void => {
    res.json(ApiResponse.success(getDiagnosticsSnapshot(), 'Diagnostics'));
  };
}
