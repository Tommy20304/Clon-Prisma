import {MiniPrisma} from "./generated-client-prueba.ts";

const prisma = MiniPrisma();

/*
Ejemplo de uso del ORM
async function findUniqueTest(){
  const usuario = await prisma.users.findUnique({
    select: {
      cedula: true,
      nombre: true,
      correo: true,
      product: {
        select: {
          id_product: true,
          nombre: true,
          price: true,
          fecha_creacion: true
        }
      }
    },

    where: {
      cedula: 1781714
    }
  });

  console.log(usuario);
}
*/
