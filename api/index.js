// Vercel serverless entrypoint. The Express app is bundled by `npm run build`
// before Vercel invokes this function.
import app from "../server/dist/server.js";

export default app;
