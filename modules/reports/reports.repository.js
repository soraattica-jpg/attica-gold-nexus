export function createReportsRepository(adapters) {
  const required=['businessDate','dashboardSummary','queueMetrics','hourly','dateRows','serializeRows','summarizeRows'];
  for(const key of required) if(typeof adapters?.[key]!=='function') throw new Error(`Reports adapter missing: ${key}`);
  return adapters;
}

export function createDatabaseCallList({db,buildFilters,visibilitySql,nonDuplicateSql,nonArtifactSql,listSelectSql,rowSortSql,openMissedSql,countableIncomingSql,backfill,serialize,compact}) {
  return async ({filters,page,limit})=>{const offset=(page-1)*limit,{where,params}=buildFilters(filters);const filteredWhere=`${where} AND ${visibilitySql} AND ${nonDuplicateSql} AND ${nonArtifactSql}`;
    const phoneSql=`NULLIF(RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(COALESCE(NULLIF(normalized_customer_number,''), caller_id),''), '+', ''), ' ', ''), '-', ''), ':', ''), 10), '')`;
    const connectedSql=`(answered_at IS NOT NULL OR IFNULL(talk_duration_seconds,0)>0 OR LOWER(IFNULL(status,'')) IN ('active','on-hold','answered','transferred'))`,countable=countableIncomingSql();
    const [countRows,summaryRows,dataRows]=await Promise.all([
      db.query(`SELECT COUNT(*) AS total FROM attica_calls WHERE ${filteredWhere}`,params),
      db.query(`SELECT COUNT(*) AS total, SUM(CASE WHEN direction='incoming' AND ${countable} THEN 1 ELSE 0 END) AS inbound, SUM(CASE WHEN direction='outgoing' THEN 1 ELSE 0 END) AS outbound, SUM(CASE WHEN ${connectedSql} THEN 1 ELSE 0 END) AS answered, COUNT(DISTINCT ${phoneSql}) AS uniqueCallers, SUM(CASE WHEN direction='incoming' AND ${countable} AND ${connectedSql} THEN 1 ELSE 0 END) AS incomingAnswered, COUNT(DISTINCT CASE WHEN direction='incoming' AND ${countable} AND LOWER(IFNULL(status,''))='missed' AND ${openMissedSql} THEN ${phoneSql} END) AS incomingMissed, COUNT(DISTINCT CASE WHEN direction='incoming' AND ${countable} THEN ${phoneSql} END) AS incomingUnique FROM attica_calls WHERE ${filteredWhere}`,params),
      db.query(`SELECT ${listSelectSql} FROM attica_calls WHERE ${filteredWhere} ORDER BY ${rowSortSql} LIMIT ? OFFSET ?`,[...params,limit,offset]),
    ]);
    const total=Number(countRows?.[0]?.[0]?.total||0),row=summaryRows?.[0]?.[0]||{},pageRows=dataRows?.[0]||[];await backfill(pageRows,{persistMatches:true});const serialized=await serialize(pageRows,{includeLeadSources:true,dedupe:false});
    return {page,limit,total,totalPages:total>0?Math.ceil(total/limit):0,summary:{total:Number(row.total||0),inbound:Number(row.inbound||0),outbound:Number(row.outbound||0),answered:Number(row.answered||0),missed:Number(row.incomingMissed||0),uniqueCallers:Number(row.uniqueCallers||0),incomingTotal:Number(row.inbound||0),incomingAnswered:Number(row.incomingAnswered||0),incomingMissed:Number(row.incomingMissed||0),incomingUnique:Number(row.incomingUnique||0)},results:compact(serialized)};
  };
}

export function createDatabaseCallExport({db,buildFilters,visibilitySql,nonDuplicateSql,nonArtifactSql,listSelectSql,rowSortSql,serialize,normalizeSource,columns,escapeCell,buildRow,businessDate,logger=console}) {
  return async({filters,res})=>{const {source}=filters,{where,params}=buildFilters(filters),filteredWhere=`${where} AND ${visibilitySql} AND ${nonDuplicateSql} AND ${nonArtifactSql}`,fileStart=filters.date||filters.fromDate||businessDate(),fileEnd=filters.date||filters.toDate||fileStart;
    let exported=0;try{const [[countRow]]=await db.query(`SELECT COUNT(*) total FROM attica_calls WHERE ${filteredWhere}`,params),unfilteredTotal=Number(countRow?.total||0);
      res.set({'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="attica-report-${fileStart}-to-${fileEnd}.csv"`,'Cache-Control':'private, no-store','X-Report-Row-Count':String(source?-1:unfilteredTotal),'X-Report-Max-Rows':'0'});res.write(`\uFEFF${columns.map(escapeCell).join(',')}\r\n`);res.flush?.();
      let cursorCreatedAt='',cursorId='';while(!res.destroyed){const cursorWhere=cursorCreatedAt?' AND (created_at<? OR (created_at=? AND id<?))':'',cursorParams=cursorCreatedAt?[cursorCreatedAt,cursorCreatedAt,cursorId]:[];
        const [rows]=await db.query(`SELECT ${listSelectSql} FROM attica_calls WHERE ${filteredWhere}${cursorWhere} ORDER BY ${rowSortSql} LIMIT 5000`,[...params,...cursorParams]);if(!rows.length)break;
        const serialized=await serialize(rows,{includeProfileNames:false,includeLeadSources:true,dedupe:false,agentId:filters.agentId});const sourceKey=normalizeSource(source),output=source?serialized.filter(row=>normalizeSource(row?.leadSource||(row?.direction==='incoming'?'Incoming':'Manual'))===sourceKey):serialized;
        if(output.length){const chunk=output.map((call,index)=>buildRow(call,exported+index).map(escapeCell).join(',')).join('\r\n');if(!res.write(`${chunk}\r\n`)&&!res.destroyed)await new Promise(resolve=>{const done=()=>{res.off('drain',done);res.off('close',done);resolve();};res.once('drain',done);res.once('close',done);});exported+=output.length;res.flush?.();}
        const last=rows.at(-1);cursorCreatedAt=last.created_at;cursorId=last.id;if(rows.length<5000)break;
      }if(!res.destroyed)res.end();logger.log?.('[calls-export]',JSON.stringify({fileStart,fileEnd,source:source||null,unfilteredTotal,exported}));
    }catch(error){logger.error?.('[calls-export] failed:',error?.message||error);if(res.headersSent)res.destroy(error);else res.status(500).json({error:error.message});}
  };
}
