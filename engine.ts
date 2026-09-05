import { normalize } from 'node:path';
import { Pool } from 'pg';
import {CondicionalWhere, comprobarErroresAtributos} from './mainFunctions.ts'
import pool from './dbConnection.ts';

export function createMiniPrismaProxy(arg?: object[]): any {
  // Retornamos un Proxy de nivel superior (ej: intercepta cuando escribes 'client.user')
  return new Proxy({}, {
    get(target, modelName: string) {
      
      // Retornamos un segundo Proxy para los métodos (ej: intercepta 'findMany' o 'create')
      return new Proxy({}, {
        get(subTarget, methodName: string) {
          
          // Aquí ocurre la magia: interceptamos la llamada final
          return async function (args: any) {
            const table = `${modelName}`; 

            if (methodName === 'findUnique') {

              let selectedFields: string | null = null;

              //se determina que no haya un select junto con un omit y asi
              comprobarErroresAtributos(args);

              //si hay un select, se filtran los campos virtuales y se colocan en el select
              if(args?.select){
                const camposTablaPrincipal = arg?.find((t: any) => t.nameTabla === table);
                selectedFields = Object.keys(args.select).filter(k => camposTablaPrincipal[k] != 'virtual').join(', ');

              }

              if(args?.omit){
                const camposTablaPrincipal = arg?.find((t: any) => t.nameTabla === table);
                const camposReales = Object.keys(camposTablaPrincipal).filter(k => camposTablaPrincipal[k] != 'virtual' && k != 'nameTabla');
                selectedFields = camposReales.filter(k => !args.omit[k]).join(', ');
              }

              let sql = `SELECT ${selectedFields ? selectedFields : '*'} FROM ${table}`;

              const keys = Object.keys(args.where);

              //se agrega el sql
              sql += ` WHERE ${table}.${keys[0]} = $1`;

              const consulta:any = await pool.query(sql, [args.where[keys[0]]])

              //si no hay resultados, se retorna null
              const result = consulta.rows.length ? consulta.rows[0] : null;

              //se aplican las acciones de include o select, si es que se especificaron, para sacar los registros relacionados de la tabla virtual
              if((args?.include || args?.select) && result){
                
                let virtualFieldsRelacionada: string | null = null;
                let whereClausesRelacionada: string | null = null;
                let paramsRelacionada: any[] = [args.where[keys[0]]]; //para la consulta cuando se saca los registros relacionados de la tabla virtual, se inicializa con el valor del parametro del where principal

                //se determina si el valor a aplicar es el include o el select, para asi poder iterar sobre los campos virtuales
                const argsIncludeOrSelect = args.include ? args.include : args.select;

                //sacamos los campos virtuales del args.include o args.select
                const camposTablaPrincipal = arg?.find((t: any) => t.nameTabla === table);
                const camposVirtuales = Object.keys(argsIncludeOrSelect).filter(k => camposTablaPrincipal[k] === 'virtual');

                //se determina si se itera los valores del include o los campos virtuales del select
                const iterar = args.include ? Object.keys(args.include) : camposVirtuales;

                for(const virtual of iterar){
  
                  if(argsIncludeOrSelect[virtual] != true){

                    //si tiene un select anidado
                    if(argsIncludeOrSelect[virtual].select){
                      virtualFieldsRelacionada = Object.keys(argsIncludeOrSelect[virtual].select).map((k: any) => `${virtual}.${k}`).join(', ');
                    }

                    //si tiene un where anidado
                    if(argsIncludeOrSelect[virtual].where){
                      whereClausesRelacionada = CondicionalWhere.cond({where: argsIncludeOrSelect[virtual].where, camposTable: arg, table: virtual, consultaRelacionada: true, placeholders: 2}).where;
                      paramsRelacionada = [...paramsRelacionada , ...CondicionalWhere.cond({where: argsIncludeOrSelect[virtual].where, camposTable: arg, table: virtual, consultaRelacionada: true, placeholders: 2}).params];
                      
                    }

                  }

                  //si no se especifico un select, se coloca todos los campos de la tabla virtual
                  if(!virtualFieldsRelacionada){
                    const camposTablaVirtual = arg?.find((t: any) => t.nameTabla === virtual);
                    virtualFieldsRelacionada = Object.keys(camposTablaVirtual).filter(k => camposTablaVirtual[k] != 'virtual' && k != 'nameTabla').map((k: any) => `${virtual}.${k}`).join(', ');
                  }

                  //se busca el id y la clave foranea de la relacion, se determina primero si una de la dos tablas tiene la clave foranea, si la tiene se coloca en la variable idOrForeing
                  
                  const tablaPrincipal = arg?.find((t: any) => t.nameTabla === table);

                  const idPrincipal = Object.keys(tablaPrincipal).find(k => tablaPrincipal[k] ===  'id'); 
                  const foreingPrincipal = Object.keys(tablaPrincipal).find(k => tablaPrincipal[k] ===  `foreing:${virtual}`)  
                  const idOrForeingPrincipal = foreingPrincipal ? foreingPrincipal : idPrincipal;
                  
                  const tablaVirtual = arg?.find((t: any) => t.nameTabla === virtual);

                  const idVirtual = Object.keys(tablaVirtual).find(k => tablaVirtual[k] ===  'id')  
                  const foreingVirtual = Object.keys(tablaVirtual).find(k => tablaVirtual[k] === `foreing:${table}`)  
                  const idOrForeingVirtual = foreingVirtual ? foreingVirtual : idVirtual;
                  
                  let consulta = `SELECT ${virtualFieldsRelacionada} FROM ${virtual}
                  LEFT JOIN ${table} ON ${virtual}.${idOrForeingVirtual} = ${table}.${idOrForeingPrincipal}
                  WHERE ${table}.${keys[0]} = $1 ${whereClausesRelacionada ? 'AND ' + whereClausesRelacionada : ''}`; 
                  
                  const relatedData = await pool.query(consulta, paramsRelacionada);
                  result[virtual] = relatedData.rows; // Agregamos los datos relacionados al resultado final     
                }
              }

              return result; // Retorno simulado
            }


            if (methodName === 'findMany') {

              let selectedFields: string | null = null;

              let sql:string;
              let params: any[] = [];
              const stringRelation: string[] = []; //el string para los operadores join
              let relacionEnWhere: boolean; //para determinar si se aplican exists en el where para colocar los user. en los select, omit
              let stringDelWhere: string = ''; //la variable donde se almacenara el string del where de la consulta
              let ordenBy:string = '' //para almacenar el orden by
              
              if(args?.ordenBy){

                const camposTablaPrincipal = arg?.find((t: any) => t.nameTabla === table);

                const camposReales = Object.keys(camposTablaPrincipal).filter(
                  k => camposTablaPrincipal[k] != 'virtual' && k != 'nameTabla');
                
                const camposVirtuales = Object.keys(camposTablaPrincipal).filter(
                  k => camposTablaPrincipal[k] === 'virtual');

                const ordenBys:string[] = [];
                
                ordenBy += 'ORDER BY '

                //se determina si hay un campo virtual en el orderBy, para asi hacer la union con la tabla virtual
                const hayRelacion = Object.keys(args.ordenBy).some(key => camposVirtuales.includes(key)); 

                Object.keys(args.ordenBy).forEach(key => {

                  if(camposVirtuales.includes(key)){

                    const objectCampo = args.ordenBy[key]; 

                    //se declaran los datos necesarios para crear la union, determinando el foreing y el id de la union
                    
                    const virtualTable = key;
                    const tablaVirtual = arg?.find((t: any) => t.nameTabla === virtualTable);
                    const idVirtual = Object.keys(tablaVirtual).find(k => tablaVirtual[k] === `id`)
                    const foreignVirtual = Object.keys(tablaVirtual).find(k => tablaVirtual[k] === `foreign:${table}`);
                    const idOrForeingVirtual = foreignVirtual ? foreignVirtual : idVirtual

                    const idPrincipal = Object.keys(camposTablaPrincipal).find(k => camposTablaPrincipal[k] === `id`);
                    const foreingPrincipal = Object.keys(camposTablaPrincipal).find(k => camposTablaPrincipal[k] === `foreign:${virtualTable}`)
                    const idOrForeingPrincipal = foreingPrincipal ? foreingPrincipal : idPrincipal

                    //se añade la union al string de uniones
                    stringRelation.push(`LEFT JOIN ${virtualTable} ON ${virtualTable}.${idOrForeingVirtual} = ${table}.${idOrForeingPrincipal}`) 
                    
                    ordenBys.push(`${key}.${Object.keys(objectCampo)[0]} ${Object.values(objectCampo)[0]}`);
                  }

                  else
                    ordenBys.push(`${hayRelacion ? `${table}.` : ''}${key} ${args.ordenBy[key]}`)

                })

                ordenBy += ordenBys.join(' , ');
                
              }

              //*** se define las condiciones del where */
              if(args?.where){

                stringDelWhere = CondicionalWhere.cond({where: args?.where, camposTable: arg, table: table, consultaRelacionada: Boolean(stringRelation.length)}).where;
                params = CondicionalWhere.cond({where: args?.where, camposTable: arg, table: table, consultaRelacionada: Boolean(stringRelation.length)}).params;
                relacionEnWhere = CondicionalWhere.cond({where: args?.where, camposTable: arg, table: table, consultaRelacionada: Boolean(stringRelation.length)}).relacionEnWhere;
              }

              //*** se define los campos seleccionados */
              if(args?.select){
                const camposTablaPrincipal = arg?.find((t: any) => t.nameTabla === table);
                let camposFiltrados = Object.keys(args.select).filter(k => camposTablaPrincipal[k] != 'virtual' && k != 'nameTabla');

                //si hay relaciones, se coloca el nombre de la tabla y el .
                selectedFields = (relacionEnWhere || stringRelation.length) ? camposFiltrados.map(k => `${table}.${k}`).join(', ') : camposFiltrados.join(', '); 
              }

              if(args?.omit){
                const camposTablaPrincipal = arg?.find((t: any) => t.nameTabla === table);
                const camposReales = Object.keys(camposTablaPrincipal).filter(k => camposTablaPrincipal[k] != 'virtual' && k != 'nameTabla');
                let camposFiltrados = camposReales.filter(k => !args.omit[k]);
                selectedFields = (relacionEnWhere || stringRelation.length) ? camposFiltrados.map(k => `${table}.${k}`).join(', ') : camposFiltrados.join(', ');
              }

              //se arma la consulta sql con los select y el where definidos (si es que tiene)
              sql = `SELECT ${selectedFields ? selectedFields : '*'} FROM ${table} ${stringRelation.length ? stringRelation.join(" ") : ''} ${stringDelWhere ? 'WHERE ' + stringDelWhere: ''} ${ordenBy}`;

              if(args?.take){
                sql += ` LIMIT ${args.take}`
              }

              if(args?.skip){
                sql += ` OFFSET ${args.skip}`
              }

              //*se hace la consulta
              const consulta = await pool.query(sql, params);
              
              let result = consulta.rows.length ? consulta.rows : null;
            
              if((args?.include || args?.select) && result){
                let virtualFields: string | null = null;
                let whereClauses: string | null = null;
                let paramsSubConsulta: any[] = [];
                let identificadores: any[] = [];

                const argsIncludeOrSelect = args.include ? args.include : args.select;

                //sacamos los campos virtuales del args.include o args.select
                const camposTablaPrincipal = arg?.find((t: any) => t.nameTabla === table);
                const camposVirtuales = Object.keys(argsIncludeOrSelect).filter(k => camposTablaPrincipal[k] === 'virtual');
 
                //se determina si se itera los valores del include o los campos virtuales del select
                const iterar = args.include ? Object.keys(args.include) : camposVirtuales;

                for(const virtual of iterar){

                  //arreglar esto porque se tiene que sacar el id de la principal para la subconsulta, pero no es seguro porque puede ser un foreing
                  const tablaPrincipal = arg?.find((t: any) => t.nameTabla === table);

                  const idPrincipal = Object.keys(tablaPrincipal).find(k => tablaPrincipal[k] ===  'id');  
                  const foreingKey = Object.keys(tablaPrincipal).find(k => tablaPrincipal[k] ===  `foreing:${virtual}`) 
                  const foreinOrIdPrincipal = foreingKey ? foreingKey : idPrincipal;
                  
                  const tablaVirtual = arg?.find((t: any) => t.nameTabla === virtual);

                  const idVirtual = Object.keys(tablaVirtual).find(k => tablaVirtual[k] ===  'id');
                  const foreingVirtual = Object.keys(tablaVirtual).find(k => tablaVirtual[k] === `foreing:${table}`)  
                  const foreingOrIdVirtual = foreingVirtual ? foreingVirtual : idVirtual


                  /**se saca los identificadores de cada uno de los registros de la consulta, para poder colocar sus relaciones correspondientes */

                  //primero se determina si la consulta por si misma tiene los identificadores
                  if(args?.select?.[idPrincipal])
                    result.forEach(k => identificadores.push(k[idPrincipal]));

                  //si no los tiene, se hace una consulta para sacarlos
                  else{
                    const consulta = `SELECT ${(relacionEnWhere || stringRelation.length) ? table + '.' : ''}${idPrincipal} FROM ${table}
                    ${stringDelWhere ? 'WHERE ' + stringDelWhere : ''}`  

                    //aqui se almacena la consulta
                    const resultConsulta = await pool.query(consulta, params); 

                    resultConsulta.rows.forEach(k => identificadores.push(k[idPrincipal]));
                  } 
                   

                  if(argsIncludeOrSelect[virtual] != true){

                    //si tiene un select anidado
                    if(argsIncludeOrSelect[virtual].select){
                      virtualFields = Object.keys(argsIncludeOrSelect[virtual].select).map((k) => `${virtual}.${k}`).join(', ');
                    }

                    //si tiene un where anidado
                    if(argsIncludeOrSelect[virtual].where){
                      whereClauses = CondicionalWhere.cond({where: argsIncludeOrSelect[virtual].where, camposTable: arg, table: virtual, consultaRelacionada: true}).where;
                      paramsSubConsulta = CondicionalWhere.cond({where: argsIncludeOrSelect[virtual].where, camposTable: arg, table: virtual, consultaRelacionada: true}).params
                      
                    }
                  }

                  //si no tiene un select
                  if(!virtualFields){
                    const camposTablaVirtual = arg?.find((t: any) => t.nameTabla === virtual);
                    virtualFields = Object.keys(camposTablaVirtual).filter(k => camposTablaVirtual[k] != 'virtual' && k != 'nameTabla').map((k: any) => `${virtual}.${k}`).join(', ');
                  }

                  //se agrega el nuevo atributo a todos los registros resultantes de la consulta principal

                  for(const [index, k] of result.entries()){

                    let consulta = `SELECT ${virtualFields ? virtualFields : '*'} FROM ${virtual} LEFT JOIN ${table} ON ${virtual}.${foreingOrIdVirtual} = ${table}.${foreinOrIdPrincipal}
                    WHERE ${whereClauses ? whereClauses + ' AND ' : ''} ${table}.${idPrincipal} = $${paramsSubConsulta.length + 1} `

                    const consult = await pool.query(consulta, [...paramsSubConsulta, identificadores[index]]); 
                    const resultConsult = consult.rows;
 
                    k[virtual] = resultConsult
                    result[index] = k; //se actualiza el registro del array result con el nuevo atributo  

                  };
                  
                }
              }
 
              return result; // Retorno simulado
            }

            if (methodName === 'create') {

              //se recolectan los campos virtuales
              const camposTablaPrincipal = arg?.find((t: any) => t.nameTabla === table);
              const camposVirtuales = Object.keys(camposTablaPrincipal).filter(k => camposTablaPrincipal[k] === 'virtual');

              //se registra el registo principal
              const keys = Object.keys(args.data).filter(k => !camposVirtuales.includes(k));
              
              const values = keys.map(k => args.data[k]);

              const columns = keys.join(', ');
              const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

              const sql = `INSERT INTO ${table} (${columns}) VALUES (${placeholders}) RETURNING *`;
             
              //se ingresa el registro principal y se obtiene el resultado
              const consulta = await pool.query(sql, values)
              const result = consulta.rows[0];

              //se comprueba de que exista un objeto {create: [...] } dentro de un campo virtual, si existe se itera sobre el array de objetos y se ejecuta una consulta SQL por cada uno de ellos 
              for(const v of camposVirtuales){
                if(args.data[v]?.create){
                  const subTable = v;
                  let idRegistroPrincipal; //guarda el id del registro principal

                  //se determina primero si la clave foranea de la union le pertenece a la tabla del campo virtual, con el objetivo de conectarla con el registro anteriormente creado

                  const camposTablaVirtual = arg?.find((t: any) => t.nameTabla === v);
                  let foreingKey = Object.keys(camposTablaVirtual).find(k => camposTablaVirtual[k] === `foreing:${table}`);
                  
                  //se comprueba que no exista mas de una clave foranea de la tabla principal
                  if(Object.keys(camposTablaVirtual).filter(k => camposTablaVirtual[k] === `foreing:${table}`).length > 1){
                    foreingKey = null;
                    console.warn(`Advertencia: La tabla ${v} tiene más de una clave foránea que apunta a la tabla ${table}, por lo tanto, no se puede apuntar automaticamente el id recien creado`);
                  }

                  //si la clave foranea le pertenece a la tabla del campo virtual, se obtiene el id del registro principal para poder ingresarlo en la tabla del campo virtual
                  if(foreingKey){
                    const idPrincipal = Object.keys(camposTablaPrincipal).find(k => camposTablaPrincipal[k] ===  'id');
                    idRegistroPrincipal = result[idPrincipal];
                  }

                  if(Array.isArray(args.data[v].create)){

                    const arrayResult = [];
                    for(const Data of args.data[v].create){

                      //si tiene la clave foranea, se ingresa tambien esa clave foranea
                      const Keys = foreingKey ? [...Object.keys(Data), foreingKey] : 
                      Object.keys(Data) ;

                      const Values = foreingKey ? [...Object.values(Data), idRegistroPrincipal] :
                      Object.values(Data);

                      const Columns = Keys.join(', ');
                      const Placeholders = Keys.map((_, i) => `$${i + 1}`).join(', ');

                      const SubSql = `INSERT INTO ${subTable} (${Columns}) VALUES (${Placeholders}) RETURNING *`;
                      
                      const consulta = await pool.query(SubSql, Values); // En un entorno real, ejecuta la consulta
                      arrayResult.push(consulta.rows[0])
                    }
                    
                    result[v] = arrayResult;
                  }

                  else{

                  const subKeys = foreingKey ? [...Object.keys(args.data[v].create), foreingKey] :
                  Object.keys(args.data[v].create);

                  const subValues = foreingKey ? [...Object.values(args.data[v].create), idRegistroPrincipal] :
                  Object.values(args.data[v].create);

                  const subColumns = subKeys.join(', ');
                  const subPlaceholders = subKeys.map((_, i) => `$${i + 1}`).join(', ');

                  const SubSql = `INSERT INTO ${subTable} (${subColumns}) VALUES (${subPlaceholders}) RETURNING *`;

                  const consulta = await pool.query(SubSql, subValues); // En un entorno real, ejecuta la consulta
                  result[v] = consulta.rows[0];
                  }
                  
                }
              }
             
              return result;
            }

            if (methodName === 'createMany'){
              const paramsCreate = [];
              const camposCreate = {};
              let placeholderCreate = 0;
              let arrayValues = [];
              let skipDuplicate: boolean = false;

              //se determina si el data tiene objetos 
              if(!args.data.length){
                throw new Error(`No hay datos en el data`)
              }

              //se extrae los campos que se ingresaran, de esa forma, para que si se repite no pase nada, y que se pueda colocar diferentes campos en cada fila cuando se haga la peticion
              args.data.forEach(object => {
                Object.keys(object).forEach(element => {
                  camposCreate[element] = null;
                });
              });

              args.data.forEach(object => {
                let stringValue = [];
                Object.keys(camposCreate).forEach(e => {
                  placeholderCreate += 1;
                  stringValue.push(`$${placeholderCreate}`);
                  paramsCreate.push(object[e] ? object[e] : null); //si no se ingresa un dato en ese campo se pone como nulo
                });

                arrayValues.push(`(${stringValue.join(', ')})`)

              });

              //se determina si el skipDuplicate esta true
              if(args?.skipDUplicate === true)
                skipDuplicate = true;
 
              const sql = `INSERT INTO ${table} (${Object.keys(camposCreate)}) VALUES ${arrayValues.join(', ')} ${skipDuplicate ? 'ON CONFLICT DO NOTHING' : ''} RETURNING *`

              const res = await pool.query(sql, paramsCreate); 
              return {count: res.rows.length}
          
            }

            if (methodName === 'delete'){
              //elimina unicamente un elemento, por lo que se hace un where unico, y si no existe el elemento, se envia un error

              //se determina si hay dos campos en el where, si los hay, tira un error
              comprobarErroresAtributos(args);

              const campoDelete = Object.keys(args.where)[0];
              const paramDelete = Object.values(args.where)[0];
              let returnValue:boolean = false;

              //se determina si se retorna el valor
              if(args?.returnValue === true) 
                returnValue = true;

              const sql = `DELETE FROM ${table} WHERE ${campoDelete} = $1 ${returnValue ? 'RETURNING *' : ''}`;

              const consulta = await pool.query(sql, [paramDelete]); //se hace la consulta de eliminacion

              //se comprueba si se elimino elementos
              if(!consulta.rowCount)
                throw new Error("El elemento no existe");

              const res = returnValue ? consulta.rows[0] : null;

              return res;

            }

            if(methodName === 'deleteMany'){
              let sql:string = `DELETE FROM ${table}`; 
              let stringDelWhere:string = '';
              let params:any[] = [];
 
              if(args?.where && arg){
                stringDelWhere = CondicionalWhere.cond({where: args?.where, camposTable: arg, table: table}).where;
                params = CondicionalWhere.cond({where: args?.where, camposTable: arg, table: table}).params;
                sql += ` WHERE ${stringDelWhere}`;
              } 

              const res = await pool.query(sql, params); 
              return {count: res.rowCount}
  
            }

            if (methodName === 'update'){
              //actualiza un elemento, por lo que se hace un where unico, y si no existe el elemento, se envia un error

              const campoWhereUpdate = Object.keys(args.where)[0];
              const camposUpdate = [];
              const paramsUpdate = [];
              let placeholder = 0;

              //se saca los campos y los valores del data del update
              Object.keys(args.data).forEach(k => {
                camposUpdate.push(k);
                paramsUpdate.push(args.data[k]);
              });

              //se crea el set
              const setUpdate = camposUpdate.map(element => {
                placeholder += 1;
                return `${element} = $${placeholder}`;
              })

              //se le agrega el valor del where
              paramsUpdate.push(Object.values(args.where)[0])

              const sql = `UPDATE ${table} SET ${setUpdate.join(', ')} WHERE ${campoWhereUpdate} = $${placeholder + 1} RETURNING *`

              const consulta = await pool.query(sql, paramsUpdate);

              if(!consulta.rowCount)
                throw new Error("El elemento no existe");

              const res = consulta.rows[0];

              return res;
            }

            if(methodName === 'updateMany'){

              let params:any[] = [];
              let stringSet:string[] = []; //donde se almacenara el string del set de la consulta
              let placeholder = 0;

              Object.keys(args.data).forEach(k => {
                placeholder += 1;
                params.push(args.data[k]);
                stringSet.push(`${k} = $${placeholder}`);
              })

              let sql:string = `UPDATE ${table} SET ${stringSet.join(', ')}`; //la consulta se tien que cambiar para que devuelva el numero de registros actualizados
              let stringDelWhere:string = '';
              
              if(args.where && arg){
                stringDelWhere = CondicionalWhere.cond({where: args.where, camposTable: arg, table: table, placeholders: placeholder + 1}).where;
                params.push(...CondicionalWhere.cond({where: args.where, camposTable: arg, table: table, placeholders: placeholder}).params);
                sql += ` WHERE ${stringDelWhere}`;
              } 

              const consulta = await pool.query(sql, params);
              return {count: consulta.rowCount}
            }

            else{
              throw new Error(`Método ${methodName} no implementado.`);
            }
          };
        } 
      });
    }
  });
}
