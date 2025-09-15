import app from './app.js';
import db from './db/db.js';
const port = 8000;


(async () => {
    try {
        const connection = await db.getConnection();
        console.log('Database connected successfully');
        connection.release();

        app.listen(port, () => {
            console.log(`Server running: http://localhost:${port}`);
        });
    } catch (error) {
        console.error('Database connection failed:', error);
        process.exit(1);
    }
})();
