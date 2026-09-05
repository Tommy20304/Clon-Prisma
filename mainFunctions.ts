/**aqui se almacena funciones que se aplicaran en el engine (se separa para no guardar todo en el engine) */

const WhereNumeric = {
  lt: (arg: {v1: string, v2: number}) => `${arg.v1} < $${arg.v2}`,
  gt: (arg: {v1: string, v2: number}) => `${arg.v1} > $${arg.v2}`,
  equals: (arg: {v1: string, v2: number}) => `${arg.v1} = $${arg.v2}`,
  in: (arg: {v1: string, v2: number}) => `${arg.v1} = ANY($${arg.v2})`,
  notIn: (arg: {v1: string, v2: number}) => `NOT (${arg.v1} = ANY($${arg.v2}))`,
  lte: (arg: {v1: string, v2: number}) => `${arg.v1} <= $${arg.v2}`,
  gte: (arg: {v1: string, v2: number}) => `${arg.v1} >= $${arg.v2}`,
  not: (arg: {v1: string, v2: number}) => `${arg.v1} != $${arg.v2}`
};

const WhereString = {
  contains: (arg: {v1: string, v2: string, insensitive?: boolean}) =>
     `${arg.v1} ${arg.insensitive ? 'ILIKE' : 'LIKE'} '%' || $${arg.v2} || '%'`,
  startsWith: (arg: {v1: string, v2: string, insensitive?: boolean}) => 
    `${arg.v1} ${arg.insensitive ? 'ILIKE' : 'LIKE'} $${arg.v2} || '%'`,
  endsWith: (arg: {v1: string, v2: string, insensitive?: boolean}) => 
    `${arg.v1} ${arg.insensitive ? 'ILIKE' : 'LIKE'} '%' || $${arg.v2}`,
  equals: (arg: {v1: string, v2: string, insensitive?: boolean}) => 
    arg.insensitive ? `LOWER(${arg.v1}) = LOWER('${arg.v2}')` : `${arg.v1} = '${arg.v2}'`,
  in: (arg: {v1: string, v2: string, insensitive?: boolean}) =>  
    `${(arg.insensitive) ? `LOWER(${arg.v1}) = ANY($${arg.v2}::text[])` : `${arg.v1} = ANY($${arg.v2}::text[])`}`  ,
  notIn: (arg: {v1: string, v2: string, insensitive?: boolean}) => 
    (arg.insensitive) ? `NOT (LOWER(${arg.v1}) = ANY($${arg.v2}))` : `NOT (${arg.v1} = ANY($${arg.v2}::text[]))`,
  not: (arg: {v1: string, v2: string, insensitive?: boolean}) => 
    (arg.insensitive) ? `LOWER(${arg.v1}) != LOWER('${arg.v2}')` : `${arg.v1} != '${arg.v2}'`
};

//objeto que entrega una funcion que permite automatizar la clausula de un where, dependiendo que el valor del (campo: valor) sea un objeto, un valor primitivo o un null
const WhereMetodos = {
  cond: (arg: {where: any, key: string, numClause: number, ope: string, nomRelationTable?: string}) => {
    //si es un objeto, se recorre todo el objeto

    /**
     * where: {where: valuesOperador[op], campo: op} -> el where es el objeto que contiene los operadores y valores para construir la clausula where
     * key: virtualTable -> el key es el nombre de la tabla virtual que se esta evaluando
     * numClause: numClause -> el numClause es el contador de los placeholders que se van a ir generando
     * ope: 'AND' -> el ope es el operador logico que se va a utilizar para unir las clausulas
     * campo: op -> el campo es el nombre del campo en el que se esta aplicando el where
     * nomRelationTable: virtualTable -> el nomRelationTable es el nombre de la tabla virtual que se esta evaluando, para poder concatenar en la clausula where
     */


    const params = [];
    const returnObject = {numClause: arg.numClause, params: [], clause: ''};

    //se comprueba si hay modoIntesitive activo
    const isInsensitive = arg.where.modeInsensitive ? arg.where.modeInsensitive : false;

    if(typeof arg.where === 'object' && arg.where !== null){

      //quitamos el modeInsensitive del objeto para que no se incluya en la clausula where
      const whereSinInsensitive = Object.keys(arg.where).filter(op => op !== 'modeInsensitive')

      returnObject.clause = whereSinInsensitive.map(k => {
        const operador = WhereNumeric[k] || WhereString[k];
        const resultOperador = operador == WhereString[k] ? operador({v1: arg.key, v2: arg.numClause, insensitive: isInsensitive}) : 
        operador({v1: arg.key, v2: arg.numClause});
        arg.numClause += 1;

        //se comprueba si el operador es in o notIn y si el modoInsensitive esta activo, para convertir todos los valores del array a minusculas
        if((k === 'in' || k === 'notIn') && isInsensitive) 
          arg.where[k] = arg.where[k].map(v => v.toLowerCase());

        params.push(arg.where[k])
        return `${arg.nomRelationTable ? `${arg.nomRelationTable}.` : ''}${resultOperador}`;
      }).join(` ${arg.ope} `);
    } 

    else if(arg.where !== null){
      arg.numClause += 1;
      params.push(arg.where);
      returnObject.clause = `${arg.nomRelationTable ? `${arg.nomRelationTable}.` : ''}${arg.key} = $${arg.numClause - 1}`;
    }
    else{
      returnObject.clause = `${arg.nomRelationTable ? `${arg.nomRelationTable}.` : ''}${arg.key} IS NULL`;
    }

    returnObject.numClause = arg.numClause;
    returnObject.params = params;
    return returnObject;
  },
}

//funcion que automatiza la creacion del string con las condiciones del where
const CondicionalWhere = {
    cond: (arg: {where: any, camposTable: object[], table: string, consultaRelacionada?: boolean, placeholders?: number}): any => {
    
    //el parametro placeholders esta por si ya hay un placeholder ya existente y se tiene que colocar aca en vez de iniciar en 1
    //el parametro consultaRelacionada es para saber si la consulta que se esta haciendo es una consulta relacionada, por si ya se sabe antes de llamar a la funcion

    let selectedFields: string | null = null;

    const params: any[] = [];
    let stringDelWhere: string = ''; //la variable donde se almacenara el string del where de la consulta

    const camposTablaPrincipal = arg.camposTable.find((t: any) => t.nameTabla === arg.table);

    const camposReales = Object.keys(camposTablaPrincipal).filter(
        k => camposTablaPrincipal[k] != 'virtual' && k != 'nameTabla');
            
    const camposVirtuales = Object.keys(camposTablaPrincipal).filter(
    k => camposTablaPrincipal[k] === 'virtual');

    const keys = Object.keys(arg.where);
    let numClause = arg.placeholders || 1;

    //se define si la consulta es relacionada, es decir, se aplica el [nombredelatabla].[campo]
    const consultaRelacionada = arg.consultaRelacionada ? arg.consultaRelacionada : keys.find(k => camposVirtuales.includes(k));

    let stringWhere:string[] = [];
    //se recorre cada key del where para sacar las clausulas
    keys.forEach((key, index) => {
      if(camposReales.includes(key)){

        //se determina si es un object, si lo es, saca los operadores y construye la cláusula where correspondiente, si no es un object, construye la cláusula where simple
        if(typeof arg.where[key] === 'object' && arg.where[key] !== null){

          //quitamos el modeInsensitive del objeto para que no se incluya en la clausula where
          const whereSinInsensitive = Object.keys(arg.where[key]).filter(op => op !== 'modeInsensitive')
          
          let string = whereSinInsensitive.map(op => {
            const operador = WhereNumeric[op] || WhereString[op];
            const resultOperador = operador == WhereString[op] ? operador({v1: key, v2: numClause, insensitive: arg.where[key].modeInsensitive}) : 
            operador({v1: key, v2: numClause});
            numClause += 1;
            if((op === 'in' || op === 'notIn') && arg.where[key].modeInsensitive) 
              arg.where[key][op] = arg.where[key][op].map(v => v.toLowerCase());
            params.push(arg.where[key][op]);
            return `${consultaRelacionada ? `${arg.table}.` : ''}${resultOperador}`;
          }).join(' AND ');
          stringWhere.push(string);
          
        }

        else if(arg.where[key] !== null){
          params.push(arg.where[key]);
          stringWhere.push(`${consultaRelacionada ? `${arg.table}.` : ''}${key} = $${numClause}`);
          numClause += 1;
        }
        else {
          stringWhere.push(`${consultaRelacionada ? `${arg.table}.` : ''}${key} IS NULL`);
        }
        
      }

      if(camposVirtuales.includes(key)){
        // Para campos virtuales, asumimos que el where es un objeto con condiciones para la tabla relacionada
        const virtualTable = key;
        const virtualConditions = arg.where[key];
        const virtualKeys = Object.keys(virtualConditions);

        virtualKeys.forEach((vk, vIndex) => {

          const valuesOperador = virtualConditions[vk];

          //se utilizan para las consultas que necesitan relacionar los ids con las claves foraneas, determinando primero cual tiene la clave primaria o el id
          const idPrincipal = Object.keys(camposTablaPrincipal).find(k => camposTablaPrincipal[k] === `id`);
          const foreingPrincipal = Object.keys(camposTablaPrincipal).find(k => camposTablaPrincipal[k] === `foreing:${virtualTable}`);
          const idOrForeingPrincipal = foreingPrincipal ? foreingPrincipal : idPrincipal;

          const tablaVirtual = arg.camposTable.find((t: any) => t.nameTabla === virtualTable);
          const foreignVirtual = Object.keys(tablaVirtual).find(k => tablaVirtual[k] === `foreing:${arg.table}`);
          const idVirtual = Object.keys(tablaVirtual).find(k => tablaVirtual[k] === `id`);
          const idOrForeingVirtual = foreignVirtual ? foreignVirtual : idVirtual

          if(vk === 'some'){

            // Si el operador es 'some', significa que queremos que exista al menos un registro relacionado que cumpla la condición
            const string = Object.keys(valuesOperador).map(op => { 
              
              const resultObject = WhereMetodos.cond({where: valuesOperador[op], key: op, numClause: numClause, ope: 'OR', nomRelationTable: virtualTable});
              numClause = resultObject.numClause;
              resultObject.params.forEach((k) => params.push(k)); //todos los parametros recogidos en el whereMetodos, se colocan en el params
              return resultObject.clause;
            }).join(' AND ');

            stringWhere.push(`EXISTS (SELECT 1 FROM ${virtualTable} WHERE ${virtualTable}.${idOrForeingVirtual} = ${arg.table}.${idOrForeingPrincipal} AND ${string})`);
          }

          if(vk === 'every'){
           
            // Si el operador es 'every', significa que queremos que todos los registros relacionados cumplan la condición
            const string = Object.keys(valuesOperador).map(op => {
               const resultObject = WhereMetodos.cond({where:  valuesOperador[op], key: op, numClause: numClause, ope: 'AND', nomRelationTable: virtualTable});
              numClause = resultObject.numClause;
              resultObject.params.forEach((k) => params.push(k));
              return resultObject.clause;
            }).join(' AND ');

            stringWhere.push(`NOT EXISTS (SELECT 1 FROM ${virtualTable} WHERE ${virtualTable}.${idOrForeingVirtual} = ${arg.table}.${idOrForeingPrincipal} AND NOT (${string}))`);
          } 
          if(vk === 'none'){
            // Si el operador es 'none', significa que queremos que ningún registro relacionado cumpla la condición
            const string = Object.keys(valuesOperador).map(op => {
               const resultObject = WhereMetodos.cond({where: valuesOperador[op], key: op, numClause: numClause, ope: 'AND', nomRelationTable: virtualTable});
              numClause = resultObject.numClause;
              resultObject.params.forEach((k) => params.push(k));
              return resultObject.clause;
            }).join(' AND ');

            stringWhere.push(`NOT EXISTS (SELECT 1 FROM ${virtualTable} WHERE ${virtualTable}.${idOrForeingVirtual} = ${arg.table}.${idOrForeingPrincipal} AND ${string})`);
          }
          
          if(vk === 'is'){

            const string = Object.keys(valuesOperador).map(op => {
               const resultObject = WhereMetodos.cond({where:  valuesOperador[op], key: op, numClause: numClause, ope: 'AND', nomRelationTable: virtualTable});
              numClause = resultObject.numClause;
              resultObject.params.forEach((k) => params.push(k));
              return resultObject.clause;
            }).join(' AND ');
            stringWhere.push(`EXISTS (SELECT 1 FROM ${virtualTable} WHERE ${virtualTable}.${idOrForeingVirtual} = ${arg.table}.${idOrForeingPrincipal} AND ${string})`);
          }

          if(vk === 'isNot'){
            const string = Object.keys(valuesOperador).map(op => {
               const resultObject = WhereMetodos.cond({where:  valuesOperador[op], key: op, numClause: numClause, ope: 'AND', nomRelationTable: virtualTable});
              numClause = resultObject.numClause;
              resultObject.params.forEach((k) => params.push(k));
              return resultObject.clause;
            }).join(' AND ');
            stringWhere.push(`NOT EXISTS (SELECT 1 FROM ${virtualTable} WHERE ${virtualTable}.${idOrForeingVirtual} = ${arg.table}.${idOrForeingPrincipal} AND ${string})`);
          }
          
        });
      }
      if(key === 'And'){
        // se recorre todas las condiciones del array
        const andClauses = arg.where.And.map((cond: any) => { 

          // se recorre cada valor de la condicion dentro de cada objeto del array
          return Object.values(cond).map((o, index) => {
            const resultObject = WhereMetodos.cond({where: o, key: Object.keys(cond)[index], numClause, ope: 'AND', nomRelationTable: consultaRelacionada ? arg.table : null});
            numClause = resultObject.numClause;
            resultObject.params.forEach((k) => params.push(k));
            return resultObject.clause;
          }).join(' AND ');
        }).join(' AND ');

        if(andClauses) stringWhere.push(`(${andClauses})`);
      }
      if(key === 'Or'){
        // se recorre todas las condiciones del array
        const andClauses = arg.where.Or.map((cond: any) => {
          // se recorre cada valor de la condicion dentro de cada objeto del array
          return Object.values(cond).map((o, index) => {
            const resultObject = WhereMetodos.cond({where: o, key: Object.keys(cond)[index], numClause, ope: 'OR', nomRelationTable: consultaRelacionada ? arg.table : null});
            numClause = resultObject.numClause;
            resultObject.params.forEach((k) => params.push(k));
            return resultObject.clause;
          }).join(' OR ');
        }).join(' OR ');
       
        if(andClauses) stringWhere.push(`(${andClauses})`);
      }
      if(key === 'Not'){

        // se recorre todas las condiciones del array
        const andClauses = arg.where.Not.map((cond: any) => {

          // se recorre cada valor de la condicion dentro de cada objeto del array
          return Object.values(cond).map((o, index) => {
            const resultObject = WhereMetodos.cond({where: o, key: Object.keys(cond)[index], numClause, ope: 'AND', nomRelationTable: consultaRelacionada ? arg.table : null});
            numClause = resultObject.numClause;
            resultObject.params.forEach((k) => params.push(k));
            return resultObject.clause;
          }).join(' AND ');
        }).join(' AND ');

        if(andClauses) stringWhere.push(`NOT (${andClauses})`);
      }
    });
    
    stringDelWhere = `${stringWhere.join(' AND ')}`;   
    return {where: stringDelWhere, params: params, relacionEnWhere: Boolean(consultaRelacionada)};
    } 
}

//se comprueba si los atributos que se pasan en findUnique, update o delete, no junten un omit con un select, un select con un include o un omit con un include, ya que no se puede mezclar estos tres atributos en una misma consulta
function comprobarErroresAtributos(args: any): void {
  if(args.select && args.omit) {
    throw new Error("No se puede usar 'select' y 'omit' al mismo tiempo.");
  }

  else if(args.select && args.include) {
    throw new Error("No se puede usar 'select' y 'include' al mismo tiempo.");
  }

  else if(args.omit && args.include) {
    throw new Error("No se puede usar 'omit' y 'include' al mismo tiempo.");
  }

  else if(args.where && Object.keys(args.where).length === 0) {
    throw new Error("El objeto 'where' no puede estar vacío.");
  }

  else if(args.where && Object.keys(args.where).length > 1) {
    throw new Error("El objeto 'where' no puede tener más de una propiedad");
  }
}

export {WhereNumeric, WhereString, WhereMetodos, CondicionalWhere, comprobarErroresAtributos};

