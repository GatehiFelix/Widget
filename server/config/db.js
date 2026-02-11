import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import 'colors';

dotenv.config();

let sequelize = null;

const connectDB = async () => {
    // Return existing connection if already connected
    if (sequelize) {
        return sequelize;
    }

    try {
        sequelize = new Sequelize(process.env.MYSQL_URI, {
            dialect: 'mysql',
            logging: false,
            pool: {
                max: 10,
                min: 0,
                acquire: 30000,
                idle: 10000
            }
        });

        await sequelize.authenticate();
        console.log('✅ MySQL Connected Successfully'.cyan.bold);
        
        return sequelize;
    } catch (err) {
        console.error(`❌ MySQL Connection Error: ${err.message}`.red.bold);
        process.exit(1);
    }
};

export default connectDB;