(() => {
  'use strict';

  const APP_VERSION = '1.2.2';
  const TILE_SIZE = 256, EARTH_RADIUS = 6378137, MIN_ZOOM = 3, MAX_ZOOM = 19;
  const FIREBASE = {
    apiKey:'AIzaSyCrhYq5nuXtdnGubI8M_kdsezDvgkZ5QbU',
    databaseURL:'https://aparcar-2100b-default-rtdb.europe-west1.firebasedatabase.app'
  };

  const $ = id => document.getElementById(id);
  const els = {
    map:$('map'),tileLayer:$('tileLayer'),userMarker:$('userMarker'),carMarker:$('carMarker'),
    candidateMarker:$('candidateMarker'),tenMeterCircle:$('tenMeterCircle'),accuracyCircle:$('accuracyCircle'),
    statusText:$('statusText'),accuracyValue:$('accuracyValue'),distanceValue:$('distanceValue'),mapHint:$('mapHint'),
    candidateActions:$('candidateActions'),emptyState:$('emptyState'),parkingState:$('parkingState'),
    parkedWhen:$('parkedWhen'),syncBadge:$('syncBadge'),shareStateText:$('shareStateText'),
    carSelect:$('carSelect'),emptyCarName:$('emptyCarName'),parkingCarName:$('parkingCarName'),
    carDialog:$('carDialog'),carDialogTitle:$('carDialogTitle'),carNameInput:$('carNameInput'),carDeleteArea:$('carDeleteArea'),
    installDialog:$('installDialog'),confirmDialog:$('confirmDialog'),confirmTitle:$('confirmTitle'),
    confirmMessage:$('confirmMessage'),confirmOkBtn:$('confirmOkBtn'),
    shareDialog:$('shareDialog'),shareDialogTitle:$('shareDialogTitle'),shareSetup:$('shareSetup'),shareReady:$('shareReady'),
    qrBox:$('qrBox'),shareHelpText:$('shareHelpText'),joinDialog:$('joinDialog'),transferCode:$('transferCode'),transferExpiry:$('transferExpiry'),codeJoinDialog:$('codeJoinDialog'),joinCodeInput:$('joinCodeInput'),transferLandingDialog:$('transferLandingDialog'),landingCode:$('landingCode')
  };

  const state = {
    center:{lat:37.3891,lon:-5.9845},zoom:18,user:null,candidate:null,parking:null,
    watchId:null,locatedOnce:false,pointers:new Map(),gesture:null,auth:null,
    cars:[],activeCarId:null,share:null,pendingJoin:null,stream:null,syncTimer:null,syncing:false,
    carDialogMode:'add',activeTransfer:null,pendingTransferCode:null
  };
  const enc = new TextEncoder(), dec = new TextDecoder();

  function activeCar(){ return state.cars.find(c=>c.id===state.activeCarId)||null; }
  function cleanName(v){ return String(v||'').trim().replace(/\s+/g,' ').slice(0,40) || 'Mi coche'; }
  function newLocalId(){ return randomToken(12); }

  async function persistCars(){
    await kvSet('cars',state.cars);
    await kvSet('activeCarId',state.activeCarId);
  }

  async function migrateCars(){
    let cars=await kvGet('cars');
    let active=await kvGet('activeCarId');
    if(Array.isArray(cars)&&cars.length){
      state.cars=cars.map(c=>({
        id:c.id||newLocalId(),name:cleanName(c.name),parking:c.parking||null,share:c.share||null
      }));
      state.activeCarId=state.cars.some(c=>c.id===active)?active:state.cars[0].id;
      return;
    }
    const legacyParking=await kvGet('parking');
    const legacyShare=await kvGet('share');
    const first={id:newLocalId(),name:'Mi coche',parking:legacyParking||null,share:legacyShare||null};
    state.cars=[first];state.activeCarId=first.id;
    await persistCars();
    await kvDel('parking'); await kvDel('share');
  }

  function applyActiveCar(){
    const c=activeCar();
    state.parking=c?.parking||null;
    state.share=c?.share||null;
    state.candidate=null;
  }

  function renderCarSelector(){
    const current=state.activeCarId;
    els.carSelect.replaceChildren();
    for(const car of state.cars){
      const o=document.createElement('option');
      o.value=car.id;
      o.textContent=`${car.share?'👥 ':''}${car.name}`;
      els.carSelect.appendChild(o);
    }
    els.carSelect.value=current||'';
  }

  function clamp(v,min,max){return Math.min(max,Math.max(min,v))}
  function worldSize(z){return TILE_SIZE*Math.pow(2,z)}
  function status(t){els.statusText.textContent=t}
  function latLonToWorld(lat,lon,z){
    const size=worldSize(z),safeLat=clamp(lat,-85.05112878,85.05112878),sin=Math.sin(safeLat*Math.PI/180);
    return{x:((lon+180)/360)*size,y:(.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*size};
  }
  function worldToLatLon(x,y,z){
    const size=worldSize(z),lon=(x/size)*360-180,n=Math.PI-2*Math.PI*y/size,lat=180/Math.PI*Math.atan(Math.sinh(n));
    return{lat:clamp(lat,-85.05112878,85.05112878),lon:((lon+540)%360)-180};
  }
  function metersPerPixel(lat,z){return Math.cos(lat*Math.PI/180)*2*Math.PI*EARTH_RADIUS/worldSize(z)}
  function coordToScreen(coord){
    const rect=els.map.getBoundingClientRect(),c=latLonToWorld(state.center.lat,state.center.lon,state.zoom),p=latLonToWorld(coord.lat,coord.lon,state.zoom);
    let dx=p.x-c.x,size=worldSize(state.zoom);if(dx>size/2)dx-=size;if(dx<-size/2)dx+=size;
    return{x:rect.width/2+dx,y:rect.height/2+(p.y-c.y)};
  }
  function screenToCoord(x,y){
    const rect=els.map.getBoundingClientRect(),c=latLonToWorld(state.center.lat,state.center.lon,state.zoom);
    return worldToLatLon(c.x+x-rect.width/2,c.y+y-rect.height/2,state.zoom);
  }
  function renderTiles(){
    const rect=els.map.getBoundingClientRect();if(!rect.width||!rect.height)return;
    const c=latLonToWorld(state.center.lat,state.center.lon,state.zoom),left=c.x-rect.width/2,top=c.y-rect.height/2,right=c.x+rect.width/2,bottom=c.y+rect.height/2,maxTile=Math.pow(2,state.zoom);
    const startX=Math.floor(left/TILE_SIZE)-1,endX=Math.floor(right/TILE_SIZE)+1,startY=Math.max(0,Math.floor(top/TILE_SIZE)-1),endY=Math.min(maxTile-1,Math.floor(bottom/TILE_SIZE)+1);
    const fragment=document.createDocumentFragment();els.tileLayer.replaceChildren();
    for(let ty=startY;ty<=endY;ty++)for(let tx=startX;tx<=endX;tx++){
      const wrappedX=((tx%maxTile)+maxTile)%maxTile,img=new Image();
      img.alt='';img.draggable=false;img.decoding='async';img.loading='eager';img.referrerPolicy='strict-origin-when-cross-origin';
      img.src=`https://tile.openstreetmap.org/${state.zoom}/${wrappedX}/${ty}.png`;img.style.left=`${tx*TILE_SIZE-left}px`;img.style.top=`${ty*TILE_SIZE-top}px`;fragment.appendChild(img);
    }
    els.tileLayer.appendChild(fragment);
  }
  function placeElement(el,coord){if(!coord){el.hidden=true;return}const p=coordToScreen(coord);el.hidden=false;el.style.left=`${p.x}px`;el.style.top=`${p.y}px`}
  function placeCircle(el,coord,meters){if(!coord||!Number.isFinite(meters)||meters<=0){el.style.display='none';return}const p=coordToScreen(coord),d=Math.max(2,meters*2/metersPerPixel(coord.lat,state.zoom));el.style.display='block';el.style.left=`${p.x}px`;el.style.top=`${p.y}px`;el.style.width=`${d}px`;el.style.height=`${d}px`}
  function renderOverlay(){placeElement(els.userMarker,state.user);placeElement(els.carMarker,state.parking);placeElement(els.candidateMarker,state.candidate);placeCircle(els.tenMeterCircle,state.user,10);placeCircle(els.accuracyCircle,state.user,state.user?.accuracy||0)}
  function renderMap(){renderTiles();renderOverlay()}
  function setZoom(z){state.zoom=clamp(Math.round(z),MIN_ZOOM,MAX_ZOOM);renderMap()}
  function centerOn(coord,z=state.zoom){if(!coord)return;state.center={lat:coord.lat,lon:coord.lon};state.zoom=clamp(z,MIN_ZOOM,MAX_ZOOM);renderMap()}
  function fitBoth(){
    if(!state.user&&!state.parking)return;if(!state.user)return centerOn(state.parking,18);if(!state.parking)return centerOn(state.user,19);
    const rect=els.map.getBoundingClientRect(),mid={lat:(state.user.lat+state.parking.lat)/2,lon:(state.user.lon+state.parking.lon)/2};
    for(let z=MAX_ZOOM;z>=MIN_ZOOM;z--){const a=latLonToWorld(state.user.lat,state.user.lon,z),b=latLonToWorld(state.parking.lat,state.parking.lon,z);if(Math.abs(a.x-b.x)<=rect.width-80&&Math.abs(a.y-b.y)<=rect.height-80){state.center=mid;state.zoom=z;renderMap();return}}
    centerOn(mid,MIN_ZOOM);
  }
  function haversine(a,b){const r=d=>d*Math.PI/180,dLat=r(b.lat-a.lat),dLon=r(b.lon-a.lon),la1=r(a.lat),la2=r(b.lat),h=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;return 2*6371000*Math.asin(Math.sqrt(h))}
  function fmtDistance(m){if(!Number.isFinite(m))return'—';return m<1000?`${Math.round(m)} m`:`${(m/1000).toFixed(1)} km`}

  function updateUI(){
    const car=activeCar(),name=car?.name||'Mi coche';
    renderCarSelector();
    els.emptyCarName.textContent=name;els.parkingCarName.textContent=`🚗 ${name}`;
    els.accuracyValue.textContent=state.user?`±${Math.round(state.user.accuracy)} m`:'—';
    els.distanceValue.textContent=state.user&&state.parking?fmtDistance(haversine(state.user,state.parking)):'—';
    els.candidateActions.hidden=!state.candidate;els.emptyState.hidden=!!state.parking;els.parkingState.hidden=!state.parking;
    els.mapHint.textContent=state.candidate?'Punto marcado: confirma abajo':`Toca el mapa donde está ${name}`;
    if(state.parking)els.parkedWhen.textContent=new Intl.DateTimeFormat('es-ES',{dateStyle:'short',timeStyle:'short'}).format(new Date(state.parking.parkedAt));
    if(state.share){
      els.shareStateText.textContent=state.syncing?'Sincronizando…':'Compartido';els.syncBadge.hidden=false;els.syncBadge.textContent=state.syncing?'Sync…':'Compartido';
      $('shareBtn').textContent='👥 QR';$('shareEmptyBtn').textContent='👥 QR';
    }else{
      els.shareStateText.textContent='Solo local';els.syncBadge.hidden=true;$('shareBtn').textContent='👥 Compartir';$('shareEmptyBtn').textContent='👥 Compartir';
    }
    renderOverlay();
  }

  function locate(){
    if(!('geolocation'in navigator)){status('Este dispositivo no ofrece geolocalización web.');return}
    status('Buscando tu ubicación…');if(state.watchId!==null)navigator.geolocation.clearWatch(state.watchId);
    state.watchId=navigator.geolocation.watchPosition(pos=>{
      const first=!state.locatedOnce;state.user={lat:pos.coords.latitude,lon:pos.coords.longitude,accuracy:pos.coords.accuracy};state.locatedOnce=true;
      status(`Ubicación localizada · precisión ±${Math.round(pos.coords.accuracy)} m`);
      if(first){state.parking?fitBoth():centerOn(state.user,19)}else updateUI();
    },err=>{if(err.code===1)status('Permiso de ubicación denegado.');else if(err.code===2)status('No se puede obtener la ubicación.');else status('La localización está tardando. Pulsa ⌖.');},{enableHighAccuracy:true,timeout:12000,maximumAge:4000});
  }

  function openDirections(mode){if(!state.parking)return;const dest=`${state.parking.lat},${state.parking.lon}`;window.location.assign(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=${mode}`)}
  function confirmAction(title,message,okLabel='Confirmar'){return new Promise(resolve=>{els.confirmTitle.textContent=title;els.confirmMessage.textContent=message;els.confirmOkBtn.textContent=okLabel;let done=false;const finish=v=>{if(done)return;done=true;try{els.confirmDialog.close()}catch(_){}resolve(v)},ok=()=>finish(true),cancel=()=>finish(false);els.confirmOkBtn.addEventListener('click',ok,{once:true});$('confirmCancelBtn').addEventListener('click',cancel,{once:true});els.confirmDialog.addEventListener('cancel',cancel,{once:true});els.confirmDialog.showModal()})}

  const DB_NAME='DondeAparqueDB',STORE='kv';
  function dbOpen(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,2);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE)};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
  async function kvGet(key){const db=await dbOpen();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).get(key);req.onsuccess=()=>resolve(req.result??null);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close()})}
  async function kvSet(key,value){const db=await dbOpen();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(value,key);tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)}})}
  async function kvDel(key){const db=await dbOpen();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(key);tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)}})}

  function bytesToB64u(bytes){let s='';bytes.forEach(b=>s+=String.fromCharCode(b));return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
  function b64uToBytes(s){s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';const raw=atob(s),out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out}
  function randomToken(bytes=18){const a=new Uint8Array(bytes);crypto.getRandomValues(a);return bytesToB64u(a)}
  function encodeInvite(obj){return bytesToB64u(enc.encode(JSON.stringify(obj)))}
  function decodeInvite(s){return JSON.parse(dec.decode(b64uToBytes(s)))}

  function normalizeTransferCode(value){
    return String(value||'').toUpperCase().replace(/[^0-9A-Z]/g,'')
      .replace(/[O]/g,'0').replace(/[IL]/g,'1');
  }
  function formatTransferCode(raw){
    raw=normalizeTransferCode(raw);
    return raw.match(/.{1,4}/g)?.join('-')||raw;
  }
  function newTransferCode(){
    const alphabet='23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    const bytes=new Uint8Array(12);crypto.getRandomValues(bytes);
    let out='';for(const b of bytes)out+=alphabet[b%alphabet.length];
    return formatTransferCode(out);
  }
  async function sha256Bytes(text){
    return new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(text)));
  }
  async function transferIdFromCode(code){
    return bytesToB64u(await sha256Bytes('donde-aparque-transfer:'+normalizeTransferCode(code)));
  }
  async function transferCryptoKey(code){
    const bytes=await sha256Bytes('donde-aparque-transfer-key:'+normalizeTransferCode(code));
    return crypto.subtle.importKey('raw',bytes,{name:'AES-GCM'},false,['encrypt','decrypt']);
  }
  async function encryptTransfer(invite,code){
    const key=await transferCryptoKey(code),iv=crypto.getRandomValues(new Uint8Array(12));
    const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(JSON.stringify(invite)));
    return{ciphertext:bytesToB64u(new Uint8Array(cipher)),iv:bytesToB64u(iv)};
  }
  async function decryptTransfer(record,code){
    const key=await transferCryptoKey(code);
    const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64uToBytes(record.iv)},key,b64uToBytes(record.ciphertext));
    return JSON.parse(dec.decode(plain));
  }

  async function importAes(keyText){return crypto.subtle.importKey('raw',b64uToBytes(keyText),{name:'AES-GCM'},false,['encrypt','decrypt'])}

  function activeRemoteState(){
    const c=activeCar();return{v:2,name:cleanName(c?.name),parking:c?.parking||null};
  }
  async function encryptState(remoteState,keyText){
    const key=await importAes(keyText),iv=crypto.getRandomValues(new Uint8Array(12)),plain=enc.encode(JSON.stringify(remoteState)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain);
    return{ciphertext:bytesToB64u(new Uint8Array(cipher)),iv:bytesToB64u(iv),updatedAt:Date.now()};
  }
  async function decryptPayload(payload,keyText){
    if(!payload)return null;const key=await importAes(keyText),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64uToBytes(payload.iv)},key,b64uToBytes(payload.ciphertext)),data=JSON.parse(dec.decode(plain));
    if(data&&Number.isFinite(data.lat)&&Number.isFinite(data.lon))return{v:1,name:null,parking:data}; // v1.1 compatible
    return{v:2,name:cleanName(data?.name||'Coche compartido'),parking:data?.parking||null};
  }

  async function ensureAuth(){
    const now=Date.now();if(state.auth?.idToken&&state.auth.expiresAt>now+60000)return state.auth;
    if(!state.auth)state.auth=await kvGet('auth');
    if(state.auth?.refreshToken)try{
      const body=new URLSearchParams({grant_type:'refresh_token',refresh_token:state.auth.refreshToken}),res=await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(FIREBASE.apiKey)}`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
      if(res.ok){const d=await res.json();state.auth={uid:d.user_id,idToken:d.id_token,refreshToken:d.refresh_token,expiresAt:Date.now()+Number(d.expires_in||3600)*1000};await kvSet('auth',state.auth);return state.auth}
    }catch(_){}
    const res=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(FIREBASE.apiKey)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({returnSecureToken:true})});
    if(!res.ok)throw new Error('No se pudo crear la identidad anónima.');const d=await res.json();state.auth={uid:d.localId,idToken:d.idToken,refreshToken:d.refreshToken,expiresAt:Date.now()+Number(d.expiresIn||3600)*1000};await kvSet('auth',state.auth);return state.auth;
  }
  async function firebaseFetch(path,options={}){
    const auth=await ensureAuth(),sep=path.includes('?')?'&':'?',url=`${FIREBASE.databaseURL}${path}${sep}auth=${encodeURIComponent(auth.idToken)}`;let res=await fetch(url,options);
    if(res.status===401){state.auth.expiresAt=0;const a=await ensureAuth(),retryUrl=`${FIREBASE.databaseURL}${path}${sep}auth=${encodeURIComponent(a.idToken)}`;res=await fetch(retryUrl,options)}
    return res;
  }

  async function createSharedCar(){
    const car=activeCar();if(!car)return;state.syncing=true;updateUI();
    try{
      const auth=await ensureAuth(),carId=randomToken(16),inviteToken=randomToken(24),aesBytes=crypto.getRandomValues(new Uint8Array(32)),key=bytesToB64u(aesBytes);
      const share={carId,inviteToken,key,createdBy:auth.uid},remote={ownerUid:auth.uid,inviteToken,members:{[auth.uid]:{joinedAt:Date.now()}},payload:await encryptState(activeRemoteState(),key)};
      const res=await firebaseFetch(`/cars/${encodeURIComponent(carId)}.json`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(remote)});
      if(!res.ok)throw new Error(`Firebase rechazó la creación (${res.status}).`);
      car.share=share;state.share=share;await persistCars();startStream();renderShareDialog();status(`«${car.name}» ya está compartido.`);
    }catch(e){status(e.message||'No se pudo crear el coche compartido.')}finally{state.syncing=false;updateUI()}
  }

  async function createTransfer(force=false){
    if(!state.share)return null;
    const now=Date.now();
    if(!force && state.activeTransfer?.expiresAt>now+30000)return state.activeTransfer;

    const auth=await ensureAuth();
    const code=newTransferCode();
    const transferId=await transferIdFromCode(code);
    const expiresAt=Date.now()+15*60*1000;
    const encrypted=await encryptTransfer({
      c:state.share.carId,t:state.share.inviteToken,k:state.share.key,v:3
    },code);
    const record={...encrypted,expiresAt,creatorUid:auth.uid};

    const res=await firebaseFetch(`/transfers/${encodeURIComponent(transferId)}.json`,{
      method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(record)
    });
    if(!res.ok)throw new Error(`No se pudo crear el código (${res.status}).`);

    state.activeTransfer={code,transferId,expiresAt};
    return state.activeTransfer;
  }

  function transferURL(code){
    return `${location.origin}${location.pathname}#transfer=${encodeURIComponent(normalizeTransferCode(code))}`;
  }

  function updateTransferDisplay(){
    const tr=state.activeTransfer;
    if(!tr){els.transferCode.textContent='—';els.transferExpiry.textContent='—';return;}
    els.transferCode.textContent=formatTransferCode(tr.code);
    const mins=Math.max(0,Math.ceil((tr.expiresAt-Date.now())/60000));
    els.transferExpiry.textContent=`Válido aproximadamente ${mins} min`;
    renderQR(transferURL(tr.code));
  }

  async function renderShareDialog(){
    const car=activeCar(),has=!!state.share;
    els.shareDialogTitle.textContent=`Compartir · ${car?.name||'Coche'}`;
    els.shareSetup.hidden=has;els.shareReady.hidden=!has;
    els.shareHelpText.textContent=has
      ?'Escanea el QR o introduce el código en otro navegador/app.'
      :'Crea el coche compartido para generar un QR y un código.';
    if(has){
      try{await createTransfer(false);updateTransferDisplay()}
      catch(e){status(e.message||'No se pudo generar el código.')}
    }
  }
  async function openShareDialog(){els.shareDialog.showModal();await renderShareDialog()}


  async function redeemTransferCode(code){
    const normalized=normalizeTransferCode(code);
    if(normalized.length!==12)throw new Error('El código debe tener 12 caracteres.');
    const transferId=await transferIdFromCode(normalized);
    const res=await firebaseFetch(`/transfers/${encodeURIComponent(transferId)}.json`);
    if(res.status===404)throw new Error('Código no encontrado.');
    if(!res.ok)throw new Error('El código no es válido o ha caducado.');
    const record=await res.json();
    if(!record || Number(record.expiresAt)<=Date.now())throw new Error('El código ha caducado.');
    let invite;
    try{invite=await decryptTransfer(record,normalized)}
    catch(_){throw new Error('El código no es correcto.');}
    if(!invite?.c||!invite?.t||!invite?.k)throw new Error('La invitación no es válida.');
    return invite;
  }

  async function linkWithTransferCode(code){
    state.syncing=true;updateUI();
    try{
      const invite=await redeemTransferCode(code);
      await joinSharedCar(invite);
      try{els.codeJoinDialog.close()}catch(_){}
      try{els.transferLandingDialog.close()}catch(_){}
      history.replaceState(null,'',location.pathname+location.search);
    }catch(e){
      status(e.message||'No se pudo vincular con ese código.');
    }finally{
      state.syncing=false;updateUI();
    }
  }

  async function joinSharedCar(invite){
    state.syncing=true;updateUI();
    try{
      const existing=state.cars.find(c=>c.share?.carId===invite.c);
      if(existing){
        state.activeCarId=existing.id;await persistCars();applyActiveCar();history.replaceState(null,'',location.pathname+location.search);state.pendingJoin=null;try{els.joinDialog.close()}catch(_){}await switchActiveCar(existing.id);status('Ese coche ya estaba vinculado.');return;
      }
      const auth=await ensureAuth(),memberPath=`/cars/${encodeURIComponent(invite.c)}/members/${encodeURIComponent(auth.uid)}.json`;
      let res=await firebaseFetch(memberPath,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({inviteToken:invite.t,joinedAt:Date.now()})});
      if(!res.ok)throw new Error('El código de vinculación no es válido o ha caducado.');
      res=await firebaseFetch(memberPath,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({joinedAt:Date.now()})});
      if(!res.ok)throw new Error('No se pudo completar la vinculación.');
      const newCar={id:newLocalId(),name:'Coche compartido',parking:null,share:{carId:invite.c,inviteToken:invite.t,key:invite.k,createdBy:null}};
      state.cars.push(newCar);state.activeCarId=newCar.id;await persistCars();applyActiveCar();
      history.replaceState(null,'',location.pathname+location.search);state.pendingJoin=null;try{els.joinDialog.close()}catch(_){}
      await fetchRemoteState();startStream();status(`Coche vinculado: ${activeCar()?.name||'Coche compartido'}.`);
    }catch(e){status(e.message||'No se pudo vincular el dispositivo.')}finally{state.syncing=false;updateUI()}
  }

  async function applyRemoteState(remote){
    const car=activeCar();if(!car||!remote)return;
    if(remote.name)car.name=cleanName(remote.name);
    car.parking=remote.parking||null;state.parking=car.parking;await persistCars();updateUI();
  }
  async function fetchRemoteState(){
    if(!state.share)return;try{
      const res=await firebaseFetch(`/cars/${encodeURIComponent(state.share.carId)}/payload.json`);if(!res.ok)return;const payload=await res.json();if(!payload)return;
      const remote=await decryptPayload(payload,state.share.key);await applyRemoteState(remote);
    }catch(_){}
  }
  async function syncActiveCar(){
    if(!state.share)return;state.syncing=true;updateUI();
    try{
      const payload=await encryptState(activeRemoteState(),state.share.key),res=await firebaseFetch(`/cars/${encodeURIComponent(state.share.carId)}/payload.json`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      if(!res.ok)throw new Error(`Sincronización rechazada (${res.status}).`);await kvSet(`pendingSync:${state.share.carId}`,false);
    }catch(e){await kvSet(`pendingSync:${state.share.carId}`,true);status('Guardado localmente. Se sincronizará cuando vuelva Internet.')}finally{state.syncing=false;updateUI()}
  }

  function stopStream(){if(state.stream){state.stream.close();state.stream=null}}
  async function startStream(){
    stopStream();if(!state.share||!navigator.onLine)return;
    try{
      const currentCarId=state.share.carId,auth=await ensureAuth(),url=`${FIREBASE.databaseURL}/cars/${encodeURIComponent(currentCarId)}/payload.json?auth=${encodeURIComponent(auth.idToken)}`,es=new EventSource(url);state.stream=es;
      const applyEvent=async ev=>{if(!state.share||state.share.carId!==currentCarId)return;try{const msg=JSON.parse(ev.data),data=msg?.data;if(!data)return;const remote=await decryptPayload(data,state.share.key);await applyRemoteState(remote)}catch(_){}};
      es.addEventListener('put',applyEvent);es.addEventListener('patch',applyEvent);es.onerror=()=>{stopStream();clearTimeout(state.syncTimer);state.syncTimer=setTimeout(startStream,8000)};
    }catch(_){}
  }

  async function saveCandidate(){
    const car=activeCar();if(!state.candidate||!car)return;
    if(state.parking){const ok=await confirmAction('Sustituir aparcamiento',`Ya hay una ubicación guardada para «${car.name}». ¿Quieres sustituirla?`,'Sustituir');if(!ok)return}
    car.parking={...state.candidate,parkedAt:new Date().toISOString()};state.parking=car.parking;state.candidate=null;await persistCars();updateUI();fitBoth();
    status(state.share?'Aparcamiento guardado y sincronizando…':'Aparcamiento guardado en este dispositivo.');if(state.share)await syncActiveCar();
  }
  async function clearParking(){
    const car=activeCar();if(!car)return;const ok=await confirmAction('¿Coche recogido?',`Se borrará la ubicación de «${car.name}»${state.share?' en todos los dispositivos vinculados.':'.'}`,'Borrar ubicación');if(!ok)return;
    car.parking=null;state.parking=null;state.candidate=null;await persistCars();updateUI();if(state.user)centerOn(state.user,19);if(state.share)await syncActiveCar();status('Aparcamiento eliminado.');
  }

  async function leaveSharedCar(){
    const car=activeCar();if(!car?.share)return;const ok=await confirmAction('Desvincular coche',`«${car.name}» dejará de recibir actualizaciones en este dispositivo. La copia local se conservará.`,'Desvincular');if(!ok)return;
    try{const auth=await ensureAuth();await firebaseFetch(`/cars/${encodeURIComponent(car.share.carId)}/members/${encodeURIComponent(auth.uid)}.json`,{method:'DELETE'})}catch(_){}
    stopStream();car.share=null;state.share=null;await persistCars();try{els.shareDialog.close()}catch(_){}updateUI();status('Este coche ya no está vinculado.');
  }
  async function shareInvite(){
    try{
      const tr=await createTransfer(false),url=transferURL(tr.code);
      const text=`Código: ${formatTransferCode(tr.code)}`;
      if(navigator.share)try{
        await navigator.share({title:`¿Dónde aparqué? · ${activeCar()?.name||'Coche'}`,text,url});return;
      }catch(_){}
      window.prompt('Copia este código o enlace:',`${formatTransferCode(tr.code)}
${url}`);
    }catch(e){status(e.message||'No se pudo compartir.')}
  }

  function openCarDialog(mode){
    const car=activeCar();state.carDialogMode=mode;
    if(mode==='add'){els.carDialogTitle.textContent='Añadir coche';els.carNameInput.value='';els.carDeleteArea.hidden=true;$('joinCarArea').hidden=false}
    else{els.carDialogTitle.textContent='Editar coche';els.carNameInput.value=car?.name||'';els.carDeleteArea.hidden=state.cars.length<=1;$('joinCarArea').hidden=true}
    els.carDialog.showModal();setTimeout(()=>els.carNameInput.focus(),50);
  }
  async function saveCarDialog(){
    const name=cleanName(els.carNameInput.value);
    if(state.carDialogMode==='add'){
      const car={id:newLocalId(),name,parking:null,share:null};state.cars.push(car);state.activeCarId=car.id;await persistCars();applyActiveCar();stopStream();updateUI();if(state.user)centerOn(state.user,19);status(`Coche añadido: ${name}.`);
    }else{
      const car=activeCar();if(!car)return;car.name=name;await persistCars();updateUI();status(`Nombre actualizado: ${name}.`);if(state.share)await syncActiveCar();
    }
    els.carDialog.close();
  }
  async function deleteActiveCar(){
    const car=activeCar();if(!car||state.cars.length<=1)return;
    const ok=await confirmAction('Eliminar coche',`«${car.name}» se eliminará de este dispositivo${car.share?'. También se desvinculará de su grupo compartido.':'.'}`,'Eliminar');if(!ok)return;
    if(car.share)try{const auth=await ensureAuth();await firebaseFetch(`/cars/${encodeURIComponent(car.share.carId)}/members/${encodeURIComponent(auth.uid)}.json`,{method:'DELETE'})}catch(_){}
    stopStream();state.cars=state.cars.filter(c=>c.id!==car.id);state.activeCarId=state.cars[0].id;await persistCars();applyActiveCar();try{els.carDialog.close()}catch(_){}updateUI();if(state.share){await fetchRemoteState();startStream()}if(state.parking)fitBoth();else if(state.user)centerOn(state.user,19);status('Coche eliminado de este dispositivo.');
  }
  async function switchActiveCar(id){
    if(!state.cars.some(c=>c.id===id)||id===state.activeCarId)return;
    stopStream();state.activeCarId=id;await persistCars();applyActiveCar();updateUI();
    if(state.share){await fetchRemoteState();startStream();const p=await kvGet(`pendingSync:${state.share.carId}`);if(p&&navigator.onLine)await syncActiveCar()}
    if(state.parking)fitBoth();else if(state.user)centerOn(state.user,19);
    status(`Coche seleccionado: ${activeCar()?.name||'Coche'}.`);
  }

  function localPoint(ev){const r=els.map.getBoundingClientRect();return{x:ev.clientX-r.left,y:ev.clientY-r.top}}
  function onPointerDown(ev){if(ev.target.closest('button,a'))return;els.map.setPointerCapture(ev.pointerId);const p=localPoint(ev);state.pointers.set(ev.pointerId,p);if(state.pointers.size===1)state.gesture={type:'single',start:p,last:p,moved:false};else if(state.pointers.size===2){const pts=[...state.pointers.values()];state.gesture={type:'pinch',lastDistance:Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y)}}}
  function onPointerMove(ev){if(!state.pointers.has(ev.pointerId))return;const p=localPoint(ev);state.pointers.set(ev.pointerId,p);if(state.pointers.size===1&&state.gesture?.type==='single'){const dx=p.x-state.gesture.last.x,dy=p.y-state.gesture.last.y;if(Math.hypot(p.x-state.gesture.start.x,p.y-state.gesture.start.y)>5)state.gesture.moved=true;if(state.gesture.moved){const c=latLonToWorld(state.center.lat,state.center.lon,state.zoom);state.center=worldToLatLon(c.x-dx,c.y-dy,state.zoom);renderMap()}state.gesture.last=p}else if(state.pointers.size===2){const pts=[...state.pointers.values()],d=Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y);if(state.gesture?.type==='pinch'){if(d>state.gesture.lastDistance*1.22){setZoom(state.zoom+1);state.gesture.lastDistance=d}if(d<state.gesture.lastDistance*.82){setZoom(state.zoom-1);state.gesture.lastDistance=d}}}}
  function onPointerUp(ev){const p=localPoint(ev),g=state.gesture;if(state.pointers.size===1&&g?.type==='single'&&!g.moved){state.candidate=screenToCoord(p.x,p.y);updateUI()}state.pointers.delete(ev.pointerId);if(state.pointers.size===0)state.gesture=null}

  async function boot(){
    try{state.auth=await kvGet('auth');await migrateCars()}catch(_){state.cars=[{id:newLocalId(),name:'Mi coche',parking:null,share:null}];state.activeCarId=state.cars[0].id}
    applyActiveCar();updateUI();renderMap();locate();
    const hash=location.hash||'';
    if(hash.startsWith('#transfer=')){
      const code=normalizeTransferCode(decodeURIComponent(hash.slice(10)));
      if(code.length===12){
        state.pendingTransferCode=code;els.landingCode.textContent=formatTransferCode(code);els.transferLandingDialog.showModal();
      }else{
        history.replaceState(null,'',location.pathname+location.search);status('El código de vinculación no es válido.');
      }
    }else if(hash.startsWith('#join='))try{
      const invite=decodeInvite(hash.slice(6));
      if(invite?.c&&invite?.t&&invite?.k){state.pendingJoin=invite;els.joinDialog.showModal()}
    }catch(_){history.replaceState(null,'',location.pathname+location.search);status('El enlace de vinculación no es válido.')}
    if(state.share){await fetchRemoteState();startStream();const pending=await kvGet(`pendingSync:${state.share.carId}`);if(pending&&navigator.onLine)syncActiveCar()}
    if(navigator.storage?.persist)try{await navigator.storage.persist()}catch(_){}
  }

  $('zoomInBtn').addEventListener('click',()=>setZoom(state.zoom+1));$('zoomOutBtn').addEventListener('click',()=>setZoom(state.zoom-1));$('locateBtn').addEventListener('click',()=>state.user?centerOn(state.user,19):locate());
  $('saveHereBtn').addEventListener('click',saveCandidate);$('cancelCandidateBtn').addEventListener('click',()=>{state.candidate=null;updateUI()});
  $('walkBtn').addEventListener('click',()=>openDirections('walking'));$('driveBtn').addEventListener('click',()=>openDirections('driving'));$('clearBtn').addEventListener('click',clearParking);
  $('shareBtn').addEventListener('click',openShareDialog);$('shareEmptyBtn').addEventListener('click',openShareDialog);$('createShareBtn').addEventListener('click',createSharedCar);$('nativeShareBtn').addEventListener('click',shareInvite);$('newTransferBtn').addEventListener('click',async()=>{try{await createTransfer(true);updateTransferDisplay();status('Nuevo código generado.')}catch(e){status(e.message||'No se pudo generar el código.')}});$('leaveShareBtn').addEventListener('click',leaveSharedCar);$('closeShareBtn').addEventListener('click',()=>els.shareDialog.close());
  $('installHelpBtn').addEventListener('click',()=>els.installDialog.showModal());$('closeInstallBtn').addEventListener('click',()=>els.installDialog.close());
  $('acceptJoinBtn').addEventListener('click',()=>state.pendingJoin&&joinSharedCar(state.pendingJoin));$('cancelJoinBtn').addEventListener('click',()=>{state.pendingJoin=null;history.replaceState(null,'',location.pathname+location.search);els.joinDialog.close()});
  els.carSelect.addEventListener('change',()=>switchActiveCar(els.carSelect.value));$('addCarBtn').addEventListener('click',()=>openCarDialog('add'));$('editCarBtn').addEventListener('click',()=>openCarDialog('edit'));
  $('carForm').addEventListener('submit',ev=>{ev.preventDefault();saveCarDialog()});$('cancelCarBtn').addEventListener('click',()=>els.carDialog.close());$('deleteCarBtn').addEventListener('click',deleteActiveCar);$('openCodeJoinBtn').addEventListener('click',()=>{els.carDialog.close();els.joinCodeInput.value='';els.codeJoinDialog.showModal();setTimeout(()=>els.joinCodeInput.focus(),50)});$('codeJoinForm').addEventListener('submit',ev=>{ev.preventDefault();linkWithTransferCode(els.joinCodeInput.value)});$('cancelCodeJoinBtn').addEventListener('click',()=>els.codeJoinDialog.close());$('linkHereBtn').addEventListener('click',()=>state.pendingTransferCode&&linkWithTransferCode(state.pendingTransferCode));$('copyLandingCodeBtn').addEventListener('click',async()=>{if(!state.pendingTransferCode)return;const value=formatTransferCode(state.pendingTransferCode);try{await navigator.clipboard.writeText(value);status('Código copiado.')}catch(_){window.prompt('Copia este código:',value)}});$('closeLandingBtn').addEventListener('click',()=>{state.pendingTransferCode=null;history.replaceState(null,'',location.pathname+location.search);els.transferLandingDialog.close()});
  els.map.addEventListener('pointerdown',onPointerDown);els.map.addEventListener('pointermove',onPointerMove);els.map.addEventListener('pointerup',onPointerUp);els.map.addEventListener('pointercancel',onPointerUp);window.addEventListener('resize',renderMap);
  window.addEventListener('online',async()=>{if(state.share){const pending=await kvGet(`pendingSync:${state.share.carId}`);if(pending)await syncActiveCar();await fetchRemoteState();startStream()}});
  window.addEventListener('offline',stopStream);document.addEventListener('visibilitychange',()=>{if(document.hidden)stopStream();else if(state.share){fetchRemoteState();startStream()}});
  if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=120').catch(()=>{}));
  boot();
})();
