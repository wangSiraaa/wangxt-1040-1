/**
 * local server entry file, for local development
 */
import app from './app.js';
import { startScheduler, stopScheduler } from './services/schedulerService.js';

/**
 * start server with port
 */
const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  console.log(`Server ready on port ${PORT}`);
  void startScheduler();
});

/**
 * close server
 */
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received');
  stopScheduler();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received');
  stopScheduler();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;