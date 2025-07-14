(() => {
  "use strict";

  /* --------------------------- CONFIG HANDLING --------------------------- */
  const CFG = window.AREZDEV_CONFIG || {};
  const isOn   = (flag)        => !!CFG[flag];
  const DEF    = (key, dflt)   => (CFG[key] !== undefined ? CFG[key] : dflt);
  const logger = CFG.logger    || ((t,p) => console.log(`[AREZ] ${t}`, p));
  const emit   = (type, payload) => { try { logger(type, payload); } catch(_) { /* no‑op */ } };

  /** Utility helpers **/
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function fetchWithRetry(url, options, retries = 3, backoff = 500) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, options);
        if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
        return res;
      } catch (err) {
        if (attempt === retries) throw err;
        await sleep(backoff * 2 ** attempt);
      }
    }
  }
  const toForm   = (d) => new URLSearchParams(d);
  const randomId = () => Math.floor(Math.random()*9_000_000_000_000_000);

  /** Runtime counters **/
  const ctx = { success: 0, fail: 0 };

  /* ------------------------ GRAPHQL THREAD FETCHER ----------------------- */
  async function* groupThreads(batchSize=12){
    let before="";
    while(true){
      const qs={batch_name:"MessengerGraphQLThreadlistFetcher",queries:JSON.stringify({o0:{doc_id:"2865354216882557",query_params:{limit:batchSize,before,tags:["INBOX"],isWorkUser:false,includeDeliveryReceipts:true,includeSeqID:false,is_work_teamwork_not_putting_muted_in_unreads:false}}}),...require("getAsyncParams")("POST")};
      const res=await fetchWithRetry(`/api/graphqlbatch/?${new URLSearchParams(qs)}`,{method:"POST"});
      const txt=await res.text();
      const clean=txt.replace(/{"successful_results":1,"error_results":0,"skipped_results":0}/,"");
      const json=JSON.parse(clean.substring(clean.indexOf("{"),clean.lastIndexOf("}")+1));
      const nodes=json.o0.data.viewer.message_threads.nodes;
      for(const n of nodes) if(n.thread_type==="GROUP") yield n.thread_key.thread_fbid;
      if(nodes.length<batchSize) break;
      before=nodes[nodes.length-1].updated_time_precise;
    }
  }

  /* ----------------------------- QUEUE EXEC ------------------------------ */
  const runQueue=async(jobs,delayMs)=>{for(const job of jobs){await job();await sleep(delayMs);}};

  /* ----------------------- Messenger Action Helper ----------------------- */
  const sendMessengerAction=async(path,body)=>{
    const res=await fetchWithRetry(path,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:toForm(body)});
    const raw=await res.text();
    return JSON.parse(raw.replace("for (;;);",""));
  };

  /* ----------------------------- PUBLIC API ------------------------------ */
  window.arezdev={
    async addMembersToAllGroups({uidList,membersPerBatch=DEF("membersPerBatch",50),delay=DEF("delaySec",5),force=false}){
      if(!force&&!isOn("enableAddMembersToGroups")){emit("skip","addMembers:disabled");return;}
      const groups=[];for await(const g of groupThreads())groups.push(g);
      const chunks=[];for(let i=0;i<uidList.length;i+=membersPerBatch)chunks.push(uidList.slice(i,i+membersPerBatch));
      const jobs=groups.flatMap(threadId=>chunks.map(chunk=>async()=>{
        const msgId=randomId();
        const body={action_type:"ma-type:log-message",log_message_type:"log:subscribe",source:"source:chat:web",thread_fbid:threadId,message_id:msgId,offline_threading_id:msgId,...require("getAsyncParams")("POST")};
        chunk.forEach((uid,i)=>body[`log_message_data[added_participants][${i}]`]=`fbid:${uid}`);
        const res=await sendMessengerAction("/messaging/send/",body);
        res.error?ctx.fail++:ctx.success++;
        emit("addMembers",{threadId,ok:!res.error,err:res.error});
      }));
      await runQueue(jobs,delay*1000);
      emit("done",{task:"addMembers",success:ctx.success,fail:ctx.fail});
    },

    async messageAllGroups({text,delay=DEF("delaySec",5),force=false}){
      if(!force&&!isOn("enableMessageAllGroups")){emit("skip","messageAll:disabled");return;}
      const groups=[];for await(const g of groupThreads())groups.push(g);
      const jobs=groups.map(threadId=>async()=>{
        const body={client:"mercury",action_type:"ma-type:user-generated-message",body:text,source:"source:titan:web",thread_fbid:threadId,message_id:randomId(),offline_threading_id:randomId(),...require("getAsyncParams")("POST")};
        const res=await sendMessengerAction("/messaging/send/",body);
        res.error?ctx.fail++:ctx.success++;
        emit("msg",{threadId,ok:!res.error,err:res.error});
      });
      await runQueue(jobs,delay*1000);
      emit("done",{task:"messageAll",success:ctx.success,fail:ctx.fail});
    },

    async createGroups({uidList,membersPerGroup=DEF("membersPerGroup",50),delay=DEF("delaySec",5),welcomeText="",force=false}){
      if(!force&&!isOn("enableCreateGroups")){emit("skip","createGroups:disabled");return;}
      const actor_id=require("CurrentUserInitialData").USER_ID; // assumed global
      const jobs=[];
      for(let i=0;i<uidList.length;i+=membersPerGroup){
        const participants=uidList.slice(i,i+membersPerGroup).map(u=>({fbid:u}));
        jobs.push(async()=>{
          const body={fb_api_req_friendly_name:"MessengerGroupCreateMutation",doc_id:"577041672419534",variables:JSON.stringify({input:{client_mutation_id:"1",actor_id,participants,thread_settings:{name:"",joinable_mode:"PRIVATE"},entry_point:"chat_sidebar_new_group"}}),...require("getAsyncParams")("POST")};
          const res=await sendMessengerAction("/api/graphql/",body);
          if(res.errors){ctx.fail++;emit("create",{ok:false,err:res.errors[0].summary});return;}
          const threadId=res.data.messenger_group_thread_create.thread.thread_key.thread_fbid;
          ctx.success++;emit("create",{ok:true,threadId});
          if(welcomeText){await sleep(1500);await sendMessengerAction("/messaging/send/",{client:"mercury",action_type:"ma-type:user-generated-message",body:welcomeText,source:"source:titan:web",thread_fbid:threadId,message_id:randomId(),offline_threading_id:randomId(),...require("getAsyncParams")("POST")});}
        });
      }
      await runQueue(jobs,delay*1000);
      emit("done",{task:"createGroups",success:ctx.success,fail:ctx.fail});
    }
  };
})();
