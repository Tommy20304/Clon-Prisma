import {MiniPrisma} from "./generated-client-prueba.ts";

const prisma = MiniPrisma();

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
async function createTest(){
  const usuarios = await prisma.factura.create({
      data: {
        num_factura: 123456,
        datos_factura: 'Factura de prueba',
        compra_venta: {
          create: {
            referencia: 312312,
            fecha: '2023-01-01',
        }
      }
  }});

  console.log(usuarios);
  
}
  //console.log("Usuario encontrado:", usuario);


async function createManyTest(){
  const usuarios = await prisma.product.createMany({
    data: [
      {price: 100, nombre: 'tomate', fecha_creacion: '21/2/82', id_user: 1781714, file_url: 'https://www.google.com'},
      {price: 200, nombre: 'papa', fecha_creacion: '21/2/82', id_user: 1781714, file_url: 'https://www.google.com'},
      {price: 300, nombre: 'cebolla', fecha_creacion: '21/2/82', id_user: 1781714, file_url: 'https://www.google.com'}
    ]
  })

  console.log(usuarios);
}

async function findManyTest(){
  const usuario = await prisma.users.findMany({
  where: {
    Not: [
      {nombre: {contains: 'maria'}}
    ]
  }


  });

  const usuarios = await prisma.product.findMany({

    select: {
      id_product: true,
      nombre: true,
      price: true,
      file_url: true,
      id_user: true,
    },

    where: {
      And: [
      {
        price: {gt: 100}
      },
      {
        nombre: {contains: 'Maria', modeInsensitive: true}
      }
    ]
    }
  });


  console.log(usuario);
  /*
  const idsUsuarios = usuario.map(u => u.cedula);
  const datosParaIngresar = [];
  idsUsuarios.forEach(id => {
    datosParaIngresar.push({id_user: id, price: 300, nombre: 'maria la', fecha_creacion: '21/2/26', file_url: 'https://www.google.com/maria'})
  })

  const ingresarDatos = await prisma.product.createMany({
    data: datosParaIngresar
  })

  console.log(ingresarDatos);*/

}

async function deleteTest(){
  const usuarios = await prisma.users.delete({
    where: {
      correo: 'nicolferna4234@gmail'
    }
  })

  console.log(usuarios);
}

async function deleteManyTest(){
  const usuarios = await prisma.users.deleteMany({
    where: {
      description: null
    }
  })

  console.log(usuarios);

}

async function updateTest(){
  const usuarios = await prisma.users.update({
    where: {
      cedula: 1781714
    },
    data: {
      correo: 'mariamiamor4234@gmail',
      nombre: 'maria hermosa'
    }
  })

  console.log(usuarios);

}

async function updateManyTest(){
  const usuarios = await prisma.users.updateMany({
    where: {
      product: {
        some: {
        price: {gt: 100}
        }
      }
    },
    data: {
      correo: 'saimarpana4234@gmail',
      nombre: 'saimar'
    }

  })

  console.log(usuarios);
}



findManyTest()
