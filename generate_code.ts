import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

//el archivo donde se describen las tablas de la bd
import descripcion from  './descripcion.json' with { type: 'json' };

let code = '// CÓDIGO AUTO-GENERADO - NO MODIFICAR\n\n'

//funcion para construir la parte 1
function parte1(){
  code += `//** PARTE 1: 
// declaracion de los tipos de las tablas de la bd y la creacion del array donde se describira estas tablas
const camposTablas:any = [];\n\n`

  for (const [modelName, fields] of Object.entries(descripcion)) {
    code += `export interface ${modelName} {\n`;
    for (const [field, array] of Object.entries(fields)) {
      const esClaveVirtual = Object.keys(descripcion).some((k:any) => k.toLowerCase() == field)
      code += `  ${field}${esClaveVirtual ? '?':''}: ${array[0]};\n`;
    }

    code += `}\n\n`;

    //se crea el objeto donde se describe la tabla

    code += `const campos${modelName} = {\n`
    code += `  'nameTabla': '${modelName.toLowerCase()}',\n`
    for (const [field, array] of Object.entries(fields)) {

      //se crea la variable donde se decide que se coloca, 'id' o 'foreing' o 'virtual'
      let valor:any = null;
      let hayId = array.find(k => k == 'id');
      let hayForeing = array.find(k => typeof k == 'object');
      let tablas = Object.keys(descripcion).map(k => k.toLowerCase())
      let esVirtual = tablas.includes(field);

      if(hayId)
        valor = 'id';
      if(hayForeing)
        valor = `foreing:${Object.values(hayForeing)[0].toLowerCase()}`
      if(esVirtual)
        valor = 'virtual'

      code += `  '${field}': '${valor}',\n`;
    }

    code += `}\n\n`;

    code += `camposTablas.push(campos${modelName});\n\n`
  }

}

function parte2(){ 
  code += `//fin de la parte 1

//*PARTE 2:
// se declaran interfaces para diferentes operaciones */

//Interfaces para las operaciones select e include de findUnique y metodos similares.\n\n`

  //se crea una funcion donde se crea el tipo de los campos virtuales
  function tipoClaveVirtual(nombreVirtual: string,  tipo: string, tablaPrincipal?:string){

    const tablas = Object.keys(descripcion).map(k=>k.toLowerCase())
    let camposVirtuales = Object.keys(descripcion[nombreVirtual]).filter(
      k =>tablas.includes(k));

    //se saca los campos foraneos
    let valoresForaneos = []
    const nomTabla = nombreVirtual.charAt(0).toUpperCase() + nombreVirtual.slice(1);
    for(const k of Object.keys(descripcion[nomTabla])){
      for(const value of descripcion[nomTabla][k]){
        if(typeof value == 'object' && value.foreing === tablaPrincipal){
          valoresForaneos.push(k);
        }
          
      }
    }

    //se comprueba si el array valoresForaneos tene mas de un elemento, si lo tiene, se elimina del array de camposVirtuales, ya que no se puede determinar cual es la clave foranea correcta
    if(valoresForaneos.length > 1)
      valoresForaneos = []

    camposVirtuales = valoresForaneos.length ? [...camposVirtuales, ...valoresForaneos]: camposVirtuales;

    return tipo == 'ope' ? 
    `| AlMenosUno<{ select?: AlMenosUno<Omit<${nombreVirtual}Operations, ${camposVirtuales.map(k=>`'${k}'`).join(' | ')}>>, 
    where?: WhereMany<${nombreVirtual}>}>;\n` 
    :
    `{ create: AlMenosUno<Omit<Create${nombreVirtual}, ${camposVirtuales.map(k=>`'${k}'`).join(' | ')}>>`
  } 

  for (const [modelName, fields] of Object.entries(descripcion)) {
    code += `export interface ${modelName}Operations {\n`;
    for (const [field, array] of Object.entries(fields)) {
      const claveVirtual = Object.keys(descripcion).find((k:any) => k.toLowerCase() == field)
      code += `  ${field}?: true${claveVirtual ? tipoClaveVirtual(claveVirtual, 'ope') : ';\n'}`;
    }

    code += `}\n\n`;
  
  }

  code += "//Intefaces para el where del findUnique y sus similares, para que solo este los campos unicos\n\n"

  for (const [modelName, fields] of Object.entries(descripcion)) {
    code += `export interface WhereUnique${modelName} {\n`;
    for (const [field, array] of Object.entries(fields)) {
      
      if(array.includes('unique') || array.includes('id'))
        code += `  ${field}?: ${array[0]};\n`
    }

    code += `}\n\n`;
  
  }

  code += "//Interfaces para el metodo create\n\n"

  for (const [modelName, fields] of Object.entries(descripcion)) {
    code += `export interface Create${modelName} {\n`;
    for (const [field, array] of Object.entries(fields)) {

      const claveVirtual = Object.keys(descripcion).find((k:any) => k.toLowerCase() == field)
      const esArray = typeof array[0] == 'string' ? array[0].includes('[]') : null;

      code += `  ${field}${array.includes('not null') || (!array.includes('auto-increment') && array.includes('id')) ? '' : '?'}:` 
      code += `${claveVirtual ? `${tipoClaveVirtual(claveVirtual, 'create', modelName)}${esArray ? '[]}':'}'}` : `${array[0]}`};\n`;
    }

    code += `}\n\n`;
  
  }
  
}

function parte3(){
  code += `//fin de la parte 2\n
//*PARTE 3
// se declara el importante tipo generativo donde hace que un objeto deba tener almenos un campo */\n
//el tipo para crear un objeto con al menos un campo de la tabla, para que no quede vacio
type AlMenosUno<T> = {
  [K in keyof T]: Required<Pick<T, K>> & Partial<Omit<T, K>>
}[keyof T];

type OrdenBy<T> = {
  [K in keyof T]?: 'asc' | 'desc'
};\n\n`
}

function parte4(){
  code += `//*PARTE 4\n
// se declaran los tipos para los where que no solo admiten valores unicos */

//tipo para el where de findMany y sus similares, con todos los campos opcionales y con operadores de comparación
type WhereMany<T> = AlMenosUno< {
  
[ K in keyof T ]?: T[K] extends number ? (WhereNumeric | number) :
T[K] extends string ? (WhereString | string) :
T[K] extends boolean ? ({ equals?: boolean } | boolean) : // Para booleanos, solo tiene sentido el operador equals (true/false)
T[K] extends Array<infer U> ? WhereRelation<U> : // Para relaciones 1:N
T[K] extends object ? WhereRelation<T[K]> : // Para relaciones 1:1
never;
} & {
  And?: AlMenosUno<Omit<WhereMany<T>, 'And' | 'Or' | 'Not'>>[];
  Or?: AlMenosUno<Omit<WhereMany<T>, 'And' | 'Or' | 'Not'>>[];
  Not?: AlMenosUno<Omit<WhereMany<T>, 'And' | 'Or' | 'Not'>>[];
}>

//tipado numerico del where
type WhereNumeric = AlMenosUno<{
  equals?: number;
  in?: number[];
  notIn?: number[];
  lt?: number; // Menor que
  lte?: number; // Menor o igual que
  gt?: number; // Mayor que
  gte?: number; // Mayor o igual que
  not?: number | WhereNumeric; //que no sea igual a ese número
 
}>

//tipado string del where
type WhereString = AlMenosUno<{
  equals?: string;
  contains?: string; //Que contenga ese texto (como un LIKE %texto% en SQL).
  startsWith?: string; //Que empiece con ese texto.
  endsWith?: string; //Que termine con ese texto.
  in?: string[];
  notIn?: string[];
  not?: string | WhereString; //que no sea igual a ese texto
  modeInsensitive?: boolean; // Busca "gmail", "Gmail", "GMAIL", etc. Le da igual las minisculas/mayúsculas.
}>

//tipado para condicionales de relaciones del where
type WhereRelation<T> = AlMenosUno<{
  some?: Omit<WhereMany<T>, 'And' | 'Or' | 'Not'>; // Al menos un registro relacionado cumple la condición
  every?: Omit<WhereMany<T>, 'And' | 'Or' | 'Not'>; // Todos los registros relacionados cumplen la condición
  none?: Omit<WhereMany<T>, 'And' | 'Or' | 'Not'>; // Ningún registro relacionado cumple la condición
  is?: Omit<WhereMany<T>, 'And' | 'Or' | 'Not'>; // El registro relacionado cumple la condición (para relaciones 1:1)
  isNot?: Omit<WhereMany<T>, 'And' | 'Or' | 'Not'>; // El registro relacionado no cumple la condición (para relaciones 1:1)
  //*el is y isNot, pueden ser del tipo T, debido a que solo sera un objeto con  los campos indicando un valor, ejemplo: {view: valor}
}>\n\n`
}

function parte5(){
  code += `//*PARTE 5
// se declara el interface principal de la ORM */\n\n`

//funciones internas para el armado de la interface

  function returnVirtualValues(nomTabla:string): string[]{
    const tablas = Object.keys(descripcion).map(k=>k.toLowerCase())
    const camposVirtuales = Object.keys(descripcion[nomTabla]).filter(k => tablas.includes(k));
    return camposVirtuales;
  }

  function returnNotVirtualValues(nomTabla:string): string[]{
    const tablas = Object.keys(descripcion).map(k=>k.toLowerCase())
    const camposNoVirtuales = Object.keys(descripcion[nomTabla]).filter(k => !tablas.includes(k));
    return camposNoVirtuales
  }

  function ordenBy(nomTabla:string){
    const valoresVirtuales = returnVirtualValues(nomTabla);
    const valoresNotVirtuales = returnNotVirtualValues(nomTabla);

    let ordenBy = 'AlMenosUno<{\n'

    for (let campo of Object.keys(descripcion[nomTabla])){

      if(valoresVirtuales.includes(campo)){
        const nomTabla = campo.charAt(0).toUpperCase() + campo.slice(1)//se cambia la primera letra a mayuscula
        const valoresVirtualesTabla = returnVirtualValues(nomTabla);
        ordenBy += `      ${campo}?: AlMenosUno<OrdenBy<${valoresVirtualesTabla.length ? `Omit<${nomTabla},${valoresVirtualesTabla.map(k=>`'${k}'`).join(' | ')}>`: `${nomTabla}`}>>\n`
        continue
      }

      ordenBy += `      ${campo}?: 'asc' | 'desc';\n`
    } 

    ordenBy += '}>';

    return ordenBy;
  }

  //para los tipo del create, para que si todos son opcionales colocarle el tipo AlMenosUno y si no no
  function todosSonOpcionales(nomTable:string){
    let sonOpcionales: boolean
    for(let array of Object.values(descripcion[nomTable])){
      if(Array.isArray(array))
      sonOpcionales = !(array.includes('not null') || (!array.includes('auto-increment') && array.includes('id')))
      if(!sonOpcionales)
        break
    } 
    return sonOpcionales;
  }

  code += 'export interface MiniPrismaClient {\n'
  for (const [modelName, fields] of Object.entries(descripcion)) {
    code += ` ${modelName.toLowerCase()}: {`;
    code += `findMany: (args?: {
    where?: WhereMany<${modelName}>,
    include?: AlMenosUno<Omit<${modelName}Operations, ${returnNotVirtualValues(modelName).map(k=>`'${k}'`).join(' | ')}>>,
    select?: AlMenosUno<${modelName}Operations>,
    omit?: AlMenosUno<${returnVirtualValues(modelName).length ? `Omit<${modelName}Operations, ${returnVirtualValues(modelName).map(k=>`'${k}'`).join(' | ')}>`:`${modelName}Operations`}>,
    ordenBy?: ${ordenBy(modelName)},
    take?: number,
    skip?: number`

    code += `}) => Promise<${modelName}[] | null>;
    findUnique: (args: {
    where: AlMenosUno<WhereUnique${modelName}>,
    include?: AlMenosUno<Omit<${modelName}Operations, ${returnNotVirtualValues(modelName).map(k=>`'${k}'`).join(' | ')}>>,
    select?: AlMenosUno<${modelName}Operations>,
    omit?: AlMenosUno<${returnVirtualValues(modelName).length ? `Omit<${modelName}Operations, ${returnVirtualValues(modelName).map(k=>`'${k}'`).join(' | ')}>`:`${modelName}Operations`}> 
  }) => Promise<${modelName} | null>;\n`
 
    code += `create: (args: { data: ${todosSonOpcionales(modelName) ? `AlMenosUno<Create${modelName}>`:`Create${modelName}`}}) => Promise<${modelName}>;
  createMany: (args: { data: ${todosSonOpcionales(modelName) ? 'AlMenosUno<':''}${returnVirtualValues(modelName).length ? `Omit<Create${modelName}, ${returnVirtualValues(modelName).map(k=>`'${k}'`).join(' | ')}>${todosSonOpcionales(modelName) ? '>':''}[]`: `Create${modelName}${todosSonOpcionales(modelName) ? '>':''}[]`}, skipDuplicates?: boolean}) => Promise<{ count: number }>
  delete: (args: { where: AlMenosUno<WhereUnique${modelName}>, returnValue?: boolean}) => Promise<${modelName} | null> 
  deleteMany: (args?: { where?: WhereMany<${modelName}>}) => Promise<{ count: number } | null>
  update: (args: { where: AlMenosUno<WhereUnique${modelName}>, data: Partial<${returnVirtualValues(modelName).length ? `Omit<${modelName}, ${returnVirtualValues(modelName).map(k=>`'${k}'`).join(' | ')}>`:`${modelName}`}> }) => Promise<${modelName} | null> 
  updateMany: (args: { where?: WhereMany<${modelName}>, data: AlMenosUno<${returnVirtualValues(modelName).length ? `Omit<${modelName}, ${returnVirtualValues(modelName).map(k=>`'${k}'`).join(' | ')}>>`:`${modelName}>`} }) => Promise<{ count: number } | null> `
  
  code += `};\n\n`; 
  }
  code += '\n}\n\n'
}

function generarCliente(){

  parte1();
  parte2();
  parte3();
  parte4();
  parte5();

  // Exportar la clase constructora que usará Proxies dinámicos
  code += `import { createMiniPrismaProxy } from './engine.ts';\n`;
  code += `export const MiniPrisma = function() {\n`;
  code += `  return createMiniPrismaProxy(camposTablas) as unknown as MiniPrismaClient;\n`;
  code += `};\n`;

  // Escribir el archivo generado en el disco duro

  // Obtener la ruta de la carpeta actual
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename); 

  fs.writeFileSync(path.join(__dirname, 'generated-client-prueba.ts'), code);
  console.log(" Client generado exitosamente en ./generated-client.ts");
}

generarCliente();