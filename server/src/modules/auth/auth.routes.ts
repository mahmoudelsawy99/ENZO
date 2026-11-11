import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { loginRateLimit, resetRateLimit } from '../../middleware/rate-limit.js';
import { validateBody } from '../../middleware/validate-request.js';
import {
  changePasswordHandler,
  forgotHandler,
  loginHandler,
  logoutAllHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
  resetHandler,
} from './auth.controller.js';
import { changePasswordSchema, forgotSchema, loginSchema, resetSchema } from './auth.validation.js';

export const authRouter = Router();

authRouter.post('/login', loginRateLimit, validateBody(loginSchema), loginHandler);
authRouter.post('/refresh', refreshHandler);
authRouter.post('/logout', logoutHandler);
authRouter.post('/logout-all', authenticate, logoutAllHandler);
authRouter.get('/me', authenticate, meHandler);
authRouter.post('/forgot-password', resetRateLimit, validateBody(forgotSchema), forgotHandler);
authRouter.post('/reset-password', resetRateLimit, validateBody(resetSchema), resetHandler);
authRouter.post('/change-password', authenticate, validateBody(changePasswordSchema), changePasswordHandler);
