import { Express, Request, Response } from 'express';
import { createResponse } from '@common/core/usecases/createResponse';
import { getDiagnosticsSnapshot } from '../diagnostics/collector';

export const registerDiagnosticsRoute = (app: Express): void => {
  app.get('/api/diagnostics', (_req: Request, res: Response) => {
    res.json(createResponse('success', getDiagnosticsSnapshot(), 'Diagnostics'));
  });
};
