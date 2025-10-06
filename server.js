import app from './app.js';
import db from './db/db.js';

const DEFAULT_PORT = 8000;

(async () => {
  try {
    const connection = await db.getConnection();
    console.log('Database connected successfully');
    connection.release();

    const server = app.listen(DEFAULT_PORT, () => {
      console.log(`Server running: http://localhost:${DEFAULT_PORT}`);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        const fallbackPort = DEFAULT_PORT + 1;
        console.warn(`Port ${DEFAULT_PORT} in use, trying ${fallbackPort}...`);
        app.listen(fallbackPort, () => {
          console.log(`Server running: http://localhost:${fallbackPort}`);
        });
      } else {
        throw err;
      }
    });
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }
})();
