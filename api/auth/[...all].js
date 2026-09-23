// Catch-all Better Auth endpoints: POST /api/auth/sign-in/email, /sign-up/email, etc.
import { toNodeHandler } from 'better-auth/node';
import { auth } from '../../_lib/betterAuth.js';

export default toNodeHandler(auth.handler);
