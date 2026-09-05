//se archivo donde se configura la conexion a la base de datos

import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv'; //para cargar las variables de entorno desde un archivo .env

// Obtener la ruta de la carpeta actual
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename); 

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const datos: any = JSON.parse(process.env.DATABASE_CONFIG);

const pool = new pg.Pool({
    host: datos.host,
    port: datos.port,
    database: datos.database,
    user: datos.user,
    password: datos.password
});

export default pool;