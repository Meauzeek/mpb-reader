'use strict';
// Only this small launcher and authenticated ciphertext are published to Pages.
(async () => {
  const status = document.querySelector('#status');
  const enter = document.querySelector('#enter');
  const params = new URLSearchParams(location.hash.slice(1));
  const supplied = params.get('unlock');
  if (supplied !== null) history.replaceState(null,'',location.pathname+location.search);
  const storageLabel = 'v41';
  const revisions = {"reader": "188b2530bbe11d17", "si": "2b791423eab68806"};
  function keyStore() {
    return new Promise((resolve,reject) => {
      const request = indexedDB.open('mpb-reader-private-access',1);
      request.onupgradeneeded = () => request.result.createObjectStore('keys');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }
  async function storeKey(key) {
    const db = await keyStore();
    try {
      return await new Promise((resolve,reject) => {
        const tx = db.transaction('keys',key ? 'readwrite' : 'readonly');
        const store = tx.objectStore('keys');
        const request = key ? store.put(key,storageLabel) : store.get(storageLabel);
        tx.oncomplete = () => resolve(request.result);
        tx.onabort = tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
  }
  async function decrypt(name,key) {
    const response = await fetch(new URL('./'+name+'.bin?v='+revisions[name],location.href),{credentials:'omit',cache:'force-cache'});
    if (!response.ok) throw Error('下载失败');
    const bytes = new Uint8Array(await response.arrayBuffer());
    const data = {name:'AES-GCM',iv:bytes.subarray(0,12),additionalData:new TextEncoder().encode('mpb-reader-v41:'+name)};
    return crypto.subtle.decrypt(data,key,bytes.subarray(12));
  }
  try {
    let key;
    if (supplied !== null) {
      if (!/^[A-Za-z0-9_-]{43}$/.test(supplied)) throw Error('无效的入口');
      const raw = Uint8Array.from(atob(supplied.replace(/-/g,'+').replace(/_/g,'/')+'='),c=>c.charCodeAt(0));
      key = await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);
    } else { key = await storeKey(null).catch(()=>null); }
    if (!key) {
      status.textContent='首次使用，请登录存放稿件入口的 GitHub 账号。';
      enter.hidden=false;
      return;
    }
    const [html,pdf] = await Promise.all([decrypt('reader',key),decrypt('si',key)]);
    if (supplied) await storeKey(key).catch(()=>{});
    const pdfUrl = URL.createObjectURL(new Blob([pdf],{type:'application/pdf'}));
    const content = new TextDecoder().decode(html).replace('@@PRIVATE_SI@@',pdfUrl);
    document.open(); document.write(content); document.close();
  } catch {
    status.textContent='未能打开审阅包。请检查网络，或从私有入口重新进入。';
    enter.hidden=false;
  }
})();
