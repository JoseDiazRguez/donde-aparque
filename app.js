(() => {
  'use strict';

  const APP_VERSION = '1.1.0';
  const TILE_SIZE = 256;
  const EARTH_RADIUS = 6378137;
  const MIN_ZOOM = 3;
  const MAX_ZOOM = 19;

  const FIREBASE = {
    apiKey: 'AIzaSyCrhYq5nuXtdnGubI8M_kdsezDvgkZ5QbU',
    databaseURL: 'https://aparcar-2100b-default-rtdb.europe-west1.firebasedatabase.app'
  };

  const $ = id => document.getElementById(id);
  const els = {
    map:$('map'), tileLayer:$('tileLayer'), userMarker:$('userMarker'), carMarker:$('carMarker'),
    candidateMarker:$('candidateMarker'), tenMeterCircle:$('tenMeterCircle'), accuracyCircle:$('accuracyCircle'),
    statusText:$('statusText'), accuracyValue:$('accuracyValue'), distanceValue:$('distanceValue'),
    mapHint:$('mapHint'), candidateActions:$('candidateActions'), emptyState:$('emptyState'),
    parkingState:$('parkingState'), parkedWhen:$('parkedWhen'), syncBadge:$('syncBadge'),
    shareStateText:$('shareStateText'), installDialog:$('installDialog'), confirmDialog:$('confirmDialog'),
    confirmTitle:$('confirmTitle'), confirmMessage:$('confirmMessage'), confirmOkBtn:$('confirmOkBtn'),
    shareDialog:$('shareDialog'), shareSetup:$('shareSetup'), shareReady:$('shareReady'),
    qrBox:$('qrBox'), shareHelpText:$('shareHelpText'), joinDialog:$('joinDialog')
  };

  const state = {
    center:{lat:37.3891, lon:-5.9845},
    zoom:18,
    user:null,
    candidate:null,
    parking:null,
    watchId:null,
    locatedOnce:false,
    pointers:new Map(),
    gesture:null,
    auth:null,
    share:null,
    pendingJoin:null,
    stream:null,
    syncTimer:null,
    syncing:false
  };

  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function clamp(v,min,max){ return Math.min(max,Math.max(min,v)); }
  function worldSize(z){ return TILE_SIZE*Math.pow(2,z); }
  function status(t){ els.statusText.textContent=t; }

  function latLonToWorld(lat,lon,z){
    const size=worldSize(z);
    const safeLat=clamp(lat,-85.05112878,85.05112878);
    const sin=Math.sin(safeLat*Math.PI/180);
    return {
      x:((lon+180)/360)*size,
      y:(0.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*size
    };
  }

  function worldToLatLon(x,y,z){
    const size=worldSize(z);
    const lon=(x/size)*360-180;
    const n=Math.PI-2*Math.PI*y/size;
    const lat=180/Math.PI*Math.atan(Math.sinh(n));
    return {lat:clamp(lat,-85.05112878,85.05112878),lon:((lon+540)%360)-180};
  }

  function metersPerPixel(lat,z){
    return Math.cos(lat*Math.PI/180)*2*Math.PI*EARTH_RADIUS/worldSize(z);
  }

  function coordToScreen(coord){
    const rect=els.map.getBoundingClientRect();
    const c=latLonToWorld(state.center.lat,state.center.lon,state.zoom);
    const p=latLonToWorld(coord.lat,coord.lon,state.zoom);
    let dx=p.x-c.x, size=worldSize(state.zoom);
    if(dx>size/2) dx-=size;
    if(dx<-size/2) dx+=size;
    return {x:rect.width/2+dx,y:rect.height/2+(p.y-c.y)};
  }

  function screenToCoord(x,y){
    const rect=els.map.getBoundingClientRect();
    const c=latLonToWorld(state.center.lat,state.center.lon,state.zoom);
    return worldToLatLon(c.x+x-rect.width/2,c.y+y-rect.height/2,state.zoom);
  }

  function renderTiles(){
    const rect=els.map.getBoundingClientRect();
    if(!rect.width||!rect.height) return;
    const c=latLonToWorld(state.center.lat,state.center.lon,state.zoom);
    const left=c.x-rect.width/2, top=c.y-rect.height/2;
    const right=c.x+rect.width/2, bottom=c.y+rect.height/2;
    const maxTile=Math.pow(2,state.zoom);
    const startX=Math.floor(left/TILE_SIZE)-1, endX=Math.floor(right/TILE_SIZE)+1;
    const startY=Math.max(0,Math.floor(top/TILE_SIZE)-1);
    const endY=Math.min(maxTile-1,Math.floor(bottom/TILE_SIZE)+1);
    const fragment=document.createDocumentFragment();
    els.tileLayer.replaceChildren();
    for(let ty=startY;ty<=endY;ty++){
      for(let tx=startX;tx<=endX;tx++){
        const wrappedX=((tx%maxTile)+maxTile)%maxTile;
        const img=new Image();
        img.alt=''; img.draggable=false; img.decoding='async'; img.loading='eager';
        img.referrerPolicy='strict-origin-when-cross-origin';
        img.src=`https://tile.openstreetmap.org/${state.zoom}/${wrappedX}/${ty}.png`;
        img.style.left=`${tx*TILE_SIZE-left}px`;
        img.style.top=`${ty*TILE_SIZE-top}px`;
        fragment.appendChild(img);
      }
    }
    els.tileLayer.appendChild(fragment);
  }

  function placeElement(el,coord){
    if(!coord){el.hidden=true;return;}
    const p=coordToScreen(coord);
    el.hidden=false; el.style.left=`${p.x}px`; el.style.top=`${p.y}px`;
  }

  function placeCircle(el,coord,meters){
    if(!coord||!Number.isFinite(meters)||meters<=0){el.style.display='none';return;}
    const p=coordToScreen(coord);
    const d=Math.max(2,meters*2/metersPerPixel(coord.lat,state.zoom));
    el.style.display='block'; el.style.left=`${p.x}px`; el.style.top=`${p.y}px`;
    el.style.width=`${d}px`; el.style.height=`${d}px`;
  }

  function renderOverlay(){
    placeElement(els.userMarker,state.user);
    placeElement(els.carMarker,state.parking);
    placeElement(els.candidateMarker,state.candidate);
    placeCircle(els.tenMeterCircle,state.user,10);
    placeCircle(els.accuracyCircle,state.user,state.user?.accuracy||0);
  }

  function renderMap(){renderTiles();renderOverlay();}
  function setZoom(z){state.zoom=clamp(Math.round(z),MIN_ZOOM,MAX_ZOOM);renderMap();}
  function centerOn(coord,z=state.zoom){
    if(!coord)return;
    state.center={lat:coord.lat,lon:coord.lon};
    state.zoom=clamp(z,MIN_ZOOM,MAX_ZOOM);
    renderMap();
  }

  function fitBoth(){
    if(!state.user&&!state.parking)return;
    if(!state.user)return centerOn(state.parking,18);
    if(!state.parking)return centerOn(state.user,19);
    const rect=els.map.getBoundingClientRect();
    const mid={lat:(state.user.lat+state.parking.lat)/2,lon:(state.user.lon+state.parking.lon)/2};
    for(let z=MAX_ZOOM;z>=MIN_ZOOM;z--){
      const a=latLonToWorld(state.user.lat,state.user.lon,z), b=latLonToWorld(state.parking.lat,state.parking.lon,z);
      if(Math.abs(a.x-b.x)<=rect.width-80&&Math.abs(a.y-b.y)<=rect.height-80){
        state.center=mid;state.zoom=z;renderMap();return;
      }
    }
    centerOn(mid,MIN_ZOOM);
  }

  function haversine(a,b){
    const r=d=>d*Math.PI/180;
    const dLat=r(b.lat-a.lat), dLon=r(b.lon-a.lon), la1=r(a.lat), la2=r(b.lat);
    const h=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;
    return 2*6371000*Math.asin(Math.sqrt(h));
  }

  function fmtDistance(m){
    if(!Number.isFinite(m))return '—';
    return m<1000?`${Math.round(m)} m`:`${(m/1000).toFixed(1)} km`;
  }

  function updateUI(){
    els.accuracyValue.textContent=state.user?`±${Math.round(state.user.accuracy)} m`:'—';
    els.distanceValue.textContent=state.user&&state.parking?fmtDistance(haversine(state.user,state.parking)):'—';
    els.candidateActions.hidden=!state.candidate;
    els.emptyState.hidden=!!state.parking;
    els.parkingState.hidden=!state.parking;
    els.mapHint.textContent=state.candidate?'Punto marcado: confirma abajo':'Toca el mapa donde está el coche';

    if(state.parking){
      els.parkedWhen.textContent=new Intl.DateTimeFormat('es-ES',{dateStyle:'short',timeStyle:'short'}).format(new Date(state.parking.parkedAt));
    }

    if(state.share){
      els.shareStateText.textContent=state.syncing?'Sincronizando…':'Compartido';
      els.syncBadge.hidden=false;
      els.syncBadge.textContent=state.syncing?'Sync…':'Compartido';
      $('shareBtn').textContent='👥 QR';
      $('shareEmptyBtn').textContent='👥 QR';
    }else{
      els.shareStateText.textContent='Solo local';
      els.syncBadge.hidden=true;
      $('shareBtn').textContent='👥 Compartir';
      $('shareEmptyBtn').textContent='👥 Compartir';
    }
    renderOverlay();
  }

  function locate(){
    if(!('geolocation'in navigator)){status('Este dispositivo no ofrece geolocalización web.');return;}
    status('Buscando tu ubicación…');
    if(state.watchId!==null) navigator.geolocation.clearWatch(state.watchId);
    state.watchId=navigator.geolocation.watchPosition(pos=>{
      const first=!state.locatedOnce;
      state.user={lat:pos.coords.latitude,lon:pos.coords.longitude,accuracy:pos.coords.accuracy};
      state.locatedOnce=true;
      status(`Ubicación localizada · precisión ±${Math.round(pos.coords.accuracy)} m`);
      if(first){ state.parking?fitBoth():centerOn(state.user,19); }
      else updateUI();
    },err=>{
      if(err.code===1)status('Permiso de ubicación denegado.');
      else if(err.code===2)status('No se puede obtener la ubicación.');
      else status('La localización está tardando. Pulsa ⌖.');
    },{enableHighAccuracy:true,timeout:12000,maximumAge:4000});
  }

  function openDirections(mode){
    if(!state.parking)return;
    const dest=`${state.parking.lat},${state.parking.lon}`;
    window.location.assign(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=${mode}`);
  }

  function confirmAction(title,message,okLabel='Confirmar'){
    return new Promise(resolve=>{
      els.confirmTitle.textContent=title;
      els.confirmMessage.textContent=message;
      els.confirmOkBtn.textContent=okLabel;
      let done=false;
      const finish=v=>{if(done)return;done=true;try{els.confirmDialog.close();}catch(_){} resolve(v);};
      const ok=()=>finish(true), cancel=()=>finish(false);
      els.confirmOkBtn.addEventListener('click',ok,{once:true});
      $('confirmCancelBtn').addEventListener('click',cancel,{once:true});
      els.confirmDialog.addEventListener('cancel',cancel,{once:true});
      els.confirmDialog.showModal();
    });
  }

  const DB_NAME='DondeAparqueDB', STORE='kv';
  function dbOpen(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,2);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE);
        if(db.objectStoreNames.contains('parking')){
          try{
            const tx=req.transaction;
            const old=tx.objectStore('parking').get('current');
            old.onsuccess=()=>{ if(old.result) tx.objectStore(STORE).put(old.result,'parking'); };
          }catch(_){}
        }
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
  }

  async function kvGet(key){
    const db=await dbOpen();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readonly');
      const req=tx.objectStore(STORE).get(key);
      req.onsuccess=()=>resolve(req.result??null);
      req.onerror=()=>reject(req.error);
      tx.oncomplete=()=>db.close();
    });
  }

  async function kvSet(key,value){
    const db=await dbOpen();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).put(value,key);
      tx.oncomplete=()=>{db.close();resolve();};
      tx.onerror=()=>{db.close();reject(tx.error);};
    });
  }

  async function kvDel(key){
    const db=await dbOpen();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete=()=>{db.close();resolve();};
      tx.onerror=()=>{db.close();reject(tx.error);};
    });
  }

  function bytesToB64u(bytes){
    let s=''; bytes.forEach(b=>s+=String.fromCharCode(b));
    return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }

  function b64uToBytes(s){
    s=s.replace(/-/g,'+').replace(/_/g,'/');
    while(s.length%4)s+='=';
    const raw=atob(s), out=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);
    return out;
  }

  function randomToken(bytes=18){const a=new Uint8Array(bytes);crypto.getRandomValues(a);return bytesToB64u(a);}
  function encodeInvite(obj){return bytesToB64u(enc.encode(JSON.stringify(obj)));}
  function decodeInvite(s){return JSON.parse(dec.decode(b64uToBytes(s)));}

  async function importAes(keyText){
    return crypto.subtle.importKey('raw',b64uToBytes(keyText),{name:'AES-GCM'},false,['encrypt','decrypt']);
  }

  async function encryptParking(parking,keyText){
    const key=await importAes(keyText);
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const plain=enc.encode(JSON.stringify(parking));
    const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain);
    return {ciphertext:bytesToB64u(new Uint8Array(cipher)),iv:bytesToB64u(iv),updatedAt:Date.now()};
  }

  async function decryptParking(payload,keyText){
    if(!payload)return null;
    const key=await importAes(keyText);
    const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64uToBytes(payload.iv)},key,b64uToBytes(payload.ciphertext));
    return JSON.parse(dec.decode(plain));
  }

  async function ensureAuth(){
    const now=Date.now();
    if(state.auth?.idToken && state.auth.expiresAt>now+60000)return state.auth;

    if(!state.auth) state.auth=await kvGet('auth');

    if(state.auth?.refreshToken){
      try{
        const body=new URLSearchParams({grant_type:'refresh_token',refresh_token:state.auth.refreshToken});
        const res=await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(FIREBASE.apiKey)}`,{
          method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body
        });
        if(res.ok){
          const d=await res.json();
          state.auth={
            uid:d.user_id,idToken:d.id_token,refreshToken:d.refresh_token,
            expiresAt:Date.now()+Number(d.expires_in||3600)*1000
          };
          await kvSet('auth',state.auth);
          return state.auth;
        }
      }catch(_){}
    }

    const res=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(FIREBASE.apiKey)}`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({returnSecureToken:true})
    });
    if(!res.ok)throw new Error('No se pudo crear la identidad anónima.');
    const d=await res.json();
    state.auth={
      uid:d.localId,idToken:d.idToken,refreshToken:d.refreshToken,
      expiresAt:Date.now()+Number(d.expiresIn||3600)*1000
    };
    await kvSet('auth',state.auth);
    return state.auth;
  }

  async function firebaseFetch(path,options={}){
    const auth=await ensureAuth();
    const sep=path.includes('?')?'&':'?';
    const url=`${FIREBASE.databaseURL}${path}${sep}auth=${encodeURIComponent(auth.idToken)}`;
    let res=await fetch(url,options);
    if(res.status===401){
      state.auth.expiresAt=0;
      const a=await ensureAuth();
      const retryUrl=`${FIREBASE.databaseURL}${path}${sep}auth=${encodeURIComponent(a.idToken)}`;
      res=await fetch(retryUrl,options);
    }
    return res;
  }

  async function createSharedCar(){
    state.syncing=true;updateUI();
    try{
      const auth=await ensureAuth();
      const carId=randomToken(16), inviteToken=randomToken(24);
      const aesBytes=crypto.getRandomValues(new Uint8Array(32));
      const key=bytesToB64u(aesBytes);
      const share={carId,inviteToken,key,createdBy:auth.uid};
      const car={
        ownerUid:auth.uid,
        inviteToken,
        members:{[auth.uid]:{joinedAt:Date.now()}}
      };
      if(state.parking)car.payload=await encryptParking(state.parking,key);

      const res=await firebaseFetch(`/cars/${encodeURIComponent(carId)}.json`,{
        method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(car)
      });
      if(!res.ok)throw new Error(`Firebase rechazó la creación (${res.status}).`);
      state.share=share;
      await kvSet('share',share);
      await kvSet('pendingSync',false);
      startStream();
      renderShareDialog();
      status('Coche compartido creado.');
    }catch(e){
      status(e.message||'No se pudo crear el coche compartido.');
    }finally{
      state.syncing=false;updateUI();
    }
  }

  function inviteURL(){
    if(!state.share)return '';
    const payload=encodeInvite({c:state.share.carId,t:state.share.inviteToken,k:state.share.key,v:1});
    return `${location.origin}${location.pathname}#join=${payload}`;
  }

  function renderQR(text){
    els.qrBox.replaceChildren();
    if(typeof window.qrcode!=='function'){
      els.qrBox.textContent='No se pudo cargar el generador QR. Puedes usar “Compartir enlace”.';
      return;
    }
    try{
      const qr=window.qrcode(0,'M');
      qr.addData(text);
      qr.make();
      els.qrBox.innerHTML=qr.createSvgTag({cellSize:5,margin:4,scalable:true});
    }catch(_){
      els.qrBox.textContent='No se pudo generar el QR.';
    }
  }

  function renderShareDialog(){
    const has=!!state.share;
    els.shareSetup.hidden=has;
    els.shareReady.hidden=!has;
    els.shareHelpText.textContent=has
      ? 'Este QR vincula otro dispositivo al mismo coche compartido.'
      : 'Crea un coche compartido para generar el QR.';
    if(has)renderQR(inviteURL());
  }

  function openShareDialog(){
    renderShareDialog();
    els.shareDialog.showModal();
  }

  async function joinSharedCar(invite){
    state.syncing=true;updateUI();
    try{
      const auth=await ensureAuth();
      const memberPath=`/cars/${encodeURIComponent(invite.c)}/members/${encodeURIComponent(auth.uid)}.json`;
      let res=await firebaseFetch(memberPath,{
        method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({inviteToken:invite.t,joinedAt:Date.now()})
      });
      if(!res.ok)throw new Error('El código de vinculación no es válido o ha caducado.');

      res=await firebaseFetch(memberPath,{
        method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({joinedAt:Date.now()})
      });
      if(!res.ok)throw new Error('No se pudo completar la vinculación.');

      state.share={carId:invite.c,inviteToken:invite.t,key:invite.k,createdBy:null};
      await kvSet('share',state.share);
      history.replaceState(null,'',location.pathname+location.search);
      state.pendingJoin=null;
      try{els.joinDialog.close();}catch(_){}
      await fetchRemoteParking();
      startStream();
      status('Dispositivo vinculado al coche compartido.');
    }catch(e){
      status(e.message||'No se pudo vincular el dispositivo.');
    }finally{
      state.syncing=false;updateUI();
    }
  }

  async function fetchRemoteParking(){
    if(!state.share)return;
    try{
      const res=await firebaseFetch(`/cars/${encodeURIComponent(state.share.carId)}/payload.json`);
      if(!res.ok)return;
      const payload=await res.json();
      if(!payload){
        state.parking=null;await kvDel('parking');updateUI();return;
      }
      const p=await decryptParking(payload,state.share.key);
      if(p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)){
        state.parking=p;await kvSet('parking',p);updateUI();
      }
    }catch(_){}
  }

  async function syncParking(){
    if(!state.share)return;
    state.syncing=true;updateUI();
    try{
      const path=`/cars/${encodeURIComponent(state.share.carId)}/payload.json`;
      let res;
      if(state.parking){
        const payload=await encryptParking(state.parking,state.share.key);
        res=await firebaseFetch(path,{
          method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
        });
      }else{
        res=await firebaseFetch(path,{method:'DELETE'});
      }
      if(!res.ok)throw new Error(`Sincronización rechazada (${res.status}).`);
      await kvSet('pendingSync',false);
    }catch(e){
      await kvSet('pendingSync',true);
      status('Guardado localmente. Se sincronizará cuando vuelva Internet.');
    }finally{
      state.syncing=false;updateUI();
    }
  }

  function stopStream(){
    if(state.stream){state.stream.close();state.stream=null;}
  }

  async function startStream(){
    stopStream();
    if(!state.share||!navigator.onLine)return;
    try{
      const auth=await ensureAuth();
      const path=`/cars/${encodeURIComponent(state.share.carId)}/payload.json`;
      const url=`${FIREBASE.databaseURL}${path}?auth=${encodeURIComponent(auth.idToken)}`;
      const es=new EventSource(url);
      state.stream=es;

      const applyEvent=async ev=>{
        try{
          const msg=JSON.parse(ev.data);
          const data=msg?.data;
          if(data===null){
            state.parking=null;await kvDel('parking');updateUI();return;
          }
          if(data?.ciphertext){
            const p=await decryptParking(data,state.share.key);
            if(p){
              const localTime=state.parking?.parkedAt?Date.parse(state.parking.parkedAt):0;
              const remoteTime=p.parkedAt?Date.parse(p.parkedAt):0;
              if(remoteTime>=localTime){
                state.parking=p;await kvSet('parking',p);updateUI();
              }
            }
          }
        }catch(_){}
      };

      es.addEventListener('put',applyEvent);
      es.addEventListener('patch',applyEvent);
      es.onerror=()=>{
        stopStream();
        clearTimeout(state.syncTimer);
        state.syncTimer=setTimeout(startStream,8000);
      };
    }catch(_){}
  }

  async function saveCandidate(){
    if(!state.candidate)return;
    if(state.parking){
      const ok=await confirmAction('Sustituir aparcamiento','Ya hay un coche guardado. ¿Quieres sustituirlo?','Sustituir');
      if(!ok)return;
    }
    state.parking={...state.candidate,parkedAt:new Date().toISOString()};
    await kvSet('parking',state.parking);
    state.candidate=null;
    updateUI();
    fitBoth();
    status(state.share?'Aparcamiento guardado y sincronizando…':'Aparcamiento guardado en este dispositivo.');
    if(state.share)await syncParking();
  }

  async function clearParking(){
    const ok=await confirmAction('¿Coche recogido?','Se borrará la ubicación actual'+(state.share?' en todos los dispositivos vinculados.':'.'),'Borrar ubicación');
    if(!ok)return;
    state.parking=null;state.candidate=null;
    await kvDel('parking');
    updateUI();
    if(state.user)centerOn(state.user,19);
    if(state.share)await syncParking();
    status('Aparcamiento eliminado.');
  }

  async function leaveSharedCar(){
    const ok=await confirmAction('Desvincular coche','Este dispositivo dejará de recibir actualizaciones. El aparcamiento local seguirá disponible.','Desvincular');
    if(!ok)return;
    try{
      const auth=await ensureAuth();
      await firebaseFetch(`/cars/${encodeURIComponent(state.share.carId)}/members/${encodeURIComponent(auth.uid)}.json`,{method:'DELETE'});
    }catch(_){}
    stopStream();
    state.share=null;
    await kvDel('share');
    try{els.shareDialog.close();}catch(_){}
    updateUI();
    status('Este dispositivo ya no está vinculado.');
  }

  async function shareInvite(){
    const url=inviteURL();
    if(!url)return;
    if(navigator.share){
      try{await navigator.share({title:'¿Dónde aparqué?',text:'Vincula este dispositivo al coche compartido.',url});return;}catch(_){}
    }
    window.prompt('Copia este enlace y envíalo a la otra persona:',url);
  }

  function localPoint(ev){
    const r=els.map.getBoundingClientRect();
    return{x:ev.clientX-r.left,y:ev.clientY-r.top};
  }

  function onPointerDown(ev){
    if(ev.target.closest('button,a'))return;
    els.map.setPointerCapture(ev.pointerId);
    const p=localPoint(ev);
    state.pointers.set(ev.pointerId,p);
    if(state.pointers.size===1)state.gesture={type:'single',start:p,last:p,moved:false};
    else if(state.pointers.size===2){
      const pts=[...state.pointers.values()];
      state.gesture={type:'pinch',lastDistance:Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y)};
    }
  }

  function onPointerMove(ev){
    if(!state.pointers.has(ev.pointerId))return;
    const p=localPoint(ev); state.pointers.set(ev.pointerId,p);
    if(state.pointers.size===1&&state.gesture?.type==='single'){
      const dx=p.x-state.gesture.last.x,dy=p.y-state.gesture.last.y;
      if(Math.hypot(p.x-state.gesture.start.x,p.y-state.gesture.start.y)>5)state.gesture.moved=true;
      if(state.gesture.moved){
        const c=latLonToWorld(state.center.lat,state.center.lon,state.zoom);
        state.center=worldToLatLon(c.x-dx,c.y-dy,state.zoom);
        renderMap();
      }
      state.gesture.last=p;
    }else if(state.pointers.size===2){
      const pts=[...state.pointers.values()];
      const d=Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y);
      if(state.gesture?.type==='pinch'){
        if(d>state.gesture.lastDistance*1.22){setZoom(state.zoom+1);state.gesture.lastDistance=d;}
        if(d<state.gesture.lastDistance*.82){setZoom(state.zoom-1);state.gesture.lastDistance=d;}
      }
    }
  }

  function onPointerUp(ev){
    const p=localPoint(ev), g=state.gesture;
    if(state.pointers.size===1&&g?.type==='single'&&!g.moved){
      state.candidate=screenToCoord(p.x,p.y);
      updateUI();
    }
    state.pointers.delete(ev.pointerId);
    if(state.pointers.size===0)state.gesture=null;
  }

  async function boot(){
    try{
      state.parking=await kvGet('parking');
      state.share=await kvGet('share');
      state.auth=await kvGet('auth');
    }catch(_){}
    updateUI();
    renderMap();
    locate();

    const hash=location.hash||'';
    if(hash.startsWith('#join=')){
      try{
        const invite=decodeInvite(hash.slice(6));
        if(invite?.c&&invite?.t&&invite?.k){
          state.pendingJoin=invite;
          els.joinDialog.showModal();
        }
      }catch(_){
        history.replaceState(null,'',location.pathname+location.search);
        status('El enlace de vinculación no es válido.');
      }
    }

    if(state.share){
      fetchRemoteParking();
      startStream();
      const pending=await kvGet('pendingSync');
      if(pending&&navigator.onLine)syncParking();
    }

    if(navigator.storage?.persist){try{await navigator.storage.persist();}catch(_){}}
  }

  $('zoomInBtn').addEventListener('click',()=>setZoom(state.zoom+1));
  $('zoomOutBtn').addEventListener('click',()=>setZoom(state.zoom-1));
  $('locateBtn').addEventListener('click',()=>state.user?centerOn(state.user,19):locate());
  $('saveHereBtn').addEventListener('click',saveCandidate);
  $('cancelCandidateBtn').addEventListener('click',()=>{state.candidate=null;updateUI();});
  $('walkBtn').addEventListener('click',()=>openDirections('walking'));
  $('driveBtn').addEventListener('click',()=>openDirections('driving'));
  $('clearBtn').addEventListener('click',clearParking);
  $('shareBtn').addEventListener('click',openShareDialog);
  $('shareEmptyBtn').addEventListener('click',openShareDialog);
  $('createShareBtn').addEventListener('click',createSharedCar);
  $('nativeShareBtn').addEventListener('click',shareInvite);
  $('leaveShareBtn').addEventListener('click',leaveSharedCar);
  $('closeShareBtn').addEventListener('click',()=>els.shareDialog.close());
  $('installHelpBtn').addEventListener('click',()=>els.installDialog.showModal());
  $('closeInstallBtn').addEventListener('click',()=>els.installDialog.close());
  $('acceptJoinBtn').addEventListener('click',()=>state.pendingJoin&&joinSharedCar(state.pendingJoin));
  $('cancelJoinBtn').addEventListener('click',()=>{
    state.pendingJoin=null;
    history.replaceState(null,'',location.pathname+location.search);
    els.joinDialog.close();
  });

  els.map.addEventListener('pointerdown',onPointerDown);
  els.map.addEventListener('pointermove',onPointerMove);
  els.map.addEventListener('pointerup',onPointerUp);
  els.map.addEventListener('pointercancel',onPointerUp);
  window.addEventListener('resize',renderMap);
  window.addEventListener('online',async()=>{
    if(state.share){
      const pending=await kvGet('pendingSync');
      if(pending)await syncParking();
      fetchRemoteParking();
      startStream();
    }
  });
  window.addEventListener('offline',stopStream);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)stopStream();
    else if(state.share){fetchRemoteParking();startStream();}
  });

  if('serviceWorker'in navigator){
    window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=110').catch(()=>{}));
  }

  boot();
})();
