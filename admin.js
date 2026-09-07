(() => {
  'use strict';

  const FIREBASE={
    apiKey:'AIzaSyCrhYq5nuXtdnGubI8M_kdsezDvgkZ5QbU',
    databaseURL:'https://aparcar-2100b-default-rtdb.europe-west1.firebasedatabase.app'
  };
  const $=id=>document.getElementById(id);
  let auth=null,stats=null;

  function setStatus(t){$('loginStatus').textContent=t||''}
  function authFetch(path,options={}){
    if(!auth?.idToken)throw new Error('No autenticado.');
    const sep=path.includes('?')?'&':'?';
    return fetch(`${FIREBASE.databaseURL}${path}${sep}auth=${encodeURIComponent(auth.idToken)}`,options);
  }

  async function signIn(email,password){
    const res=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(FIREBASE.apiKey)}`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email,password,returnSecureToken:true})
    });
    const d=await res.json();
    if(!res.ok)throw new Error('Correo o contraseña incorrectos.');
    auth={uid:d.localId,idToken:d.idToken,email:d.email};
    sessionStorage.setItem('adminAuth',JSON.stringify(auth));
  }

  async function checkAdmin(){
    const res=await authFetch(`/admins/${encodeURIComponent(auth.uid)}.json`);
    if(!res.ok)return false;
    return (await res.json())===true;
  }

  function countMap(values){
    const m=new Map();
    for(const v of values){
      const k=(v==null||v==='')?'Sin identificar':String(v);
      m.set(k,(m.get(k)||0)+1);
    }
    return [...m.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'es'));
  }
  function renderRows(el,rows){
    el.replaceChildren();
    if(!rows.length){el.textContent='Sin datos';return}
    for(const [name,count] of rows){
      const r=document.createElement('div');r.className='stat-row';
      const n=document.createElement('span');n.textContent=name;
      const c=document.createElement('strong');c.textContent=count;
      r.append(n,c);el.appendChild(r);
    }
  }
  function entries(obj){return obj&&typeof obj==='object'?Object.values(obj):[]}

  function render(){
    const installs=entries(stats?.installations);
    const now=Date.now(),day=86400000;
    $('mTotal').textContent=installs.length;
    $('m24').textContent=installs.filter(x=>now-Number(x.lastSeen||0)<=day).length;
    $('m7').textContent=installs.filter(x=>now-Number(x.lastSeen||0)<=7*day).length;
    $('m30').textContent=installs.filter(x=>now-Number(x.lastSeen||0)<=30*day).length;
    $('mPwa').textContent=installs.filter(x=>x.mode==='standalone').length;
    $('mBrowser').textContent=installs.filter(x=>x.mode==='browser').length;

    const carMembers=stats?.carMembers||{};
    $('mCars').textContent=Object.keys(carMembers).length;
    $('mLinks').textContent=Object.values(carMembers).reduce((n,m)=>n+Object.keys(m||{}).length,0);

    renderRows($('versions'),countMap(installs.map(x=>x.version)));
    renderRows($('countries'),countMap(installs.map(x=>x.country)));

    const countries=[...new Set(installs.map(x=>x.country).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
    const cf=$('countryFilter'),selectedCountry=cf.value;
    cf.innerHTML='<option value="">Todos los países</option>';
    for(const c of countries){const o=document.createElement('option');o.value=c;o.textContent=c;cf.appendChild(o)}
    if(countries.includes(selectedCountry))cf.value=selectedCountry;

    updateRegionsAndMunicipalities(installs);
    $('updatedAt').textContent=new Intl.DateTimeFormat('es-ES',{dateStyle:'short',timeStyle:'medium'}).format(new Date());
  }

  function updateRegionsAndMunicipalities(installs=entries(stats?.installations)){
    const country=$('countryFilter').value;
    const filteredCountry=country?installs.filter(x=>x.country===country):installs;
    const regions=[...new Set(filteredCountry.map(x=>x.region).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
    const rf=$('regionFilter'),old=rf.value;
    rf.innerHTML='<option value="">Todas las regiones</option>';
    for(const r of regions){const o=document.createElement('option');o.value=r;o.textContent=r;rf.appendChild(o)}
    if(regions.includes(old))rf.value=old;

    const region=rf.value;
    const filtered=region?filteredCountry.filter(x=>x.region===region):filteredCountry;
    renderRows($('municipalities'),countMap(filtered.map(x=>x.municipality)));
  }

  async function loadStats(){
    const res=await authFetch('/stats.json');
    if(res.status===401||res.status===403)throw new Error('Este usuario no tiene permiso de administrador.');
    if(!res.ok)throw new Error('No se pudieron cargar las estadísticas.');
    stats=await res.json()||{};
    render();
  }

  async function showDashboard(){
    if(!(await checkAdmin()))throw new Error('Este usuario no está autorizado como administrador.');
    $('loginCard').hidden=true;$('dashboard').hidden=false;$('logoutBtn').hidden=false;
    await loadStats();
  }

  $('loginForm').addEventListener('submit',async ev=>{
    ev.preventDefault();setStatus('Entrando…');
    try{
      await signIn($('email').value,$('password').value);
      await showDashboard();setStatus('');
    }catch(e){auth=null;sessionStorage.removeItem('adminAuth');setStatus(e.message||'No se pudo iniciar sesión.')}
  });
  $('refreshBtn').addEventListener('click',()=>loadStats().catch(e=>alert(e.message)));
  $('countryFilter').addEventListener('change',()=>updateRegionsAndMunicipalities());
  $('regionFilter').addEventListener('change',()=>{
    const installs=entries(stats?.installations),country=$('countryFilter').value,region=$('regionFilter').value;
    const filtered=installs.filter(x=>(!country||x.country===country)&&(!region||x.region===region));
    renderRows($('municipalities'),countMap(filtered.map(x=>x.municipality)));
  });
  $('logoutBtn').addEventListener('click',()=>{
    auth=null;sessionStorage.removeItem('adminAuth');$('dashboard').hidden=true;$('loginCard').hidden=false;$('logoutBtn').hidden=true;
  });

  try{
    const saved=JSON.parse(sessionStorage.getItem('adminAuth')||'null');
    if(saved?.idToken){auth=saved;showDashboard().catch(()=>{auth=null;sessionStorage.removeItem('adminAuth')})}
  }catch(_){}
})();
