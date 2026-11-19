(() => {
  'use strict';

  const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzeQJ-HCToW9tJw62YDSYL1oeZyxxzpxbg9KYqpp8GHsTa9CJ9o_fuvYjH48QW3W2PccA/exec';
  const MAX_FILES = 50;
  const BATCH_SIZE = 1; // Um arquivo por requisição reduz falhas por tamanho/tempo.
  const MAX_ORIGINAL_BYTES = 15 * 1024 * 1024;
  const MAX_COMPRESSED_BYTES = 2 * 1024 * 1024;
  const MAX_SIDE = 1600;
  const DB_NAME = 'gj-mural-offline-v1';
  const STORE_NAME = 'pending-photos';

  const $ = id => document.getElementById(id);
  const form = $('formFoto');
  const galleryInput = $('inputFoto');
  const cameraInput = $('cameraInput');
  const cameraButton = $('btnCamera');
  const nameInput = $('nomeConvidado');
  const messageInput = $('mensagemConvidado');
  const previewArea = $('previewArea');
  const previewList = $('listaPreviewsFotos');
  const counter = $('contadorFotos');
  const clearButton = $('removerFoto');
  const status = $('statusEnvio');
  const offlineInfo = $('offlineInfo');
  const gallery = $('gradeFotos');
  const submitButton = form && form.querySelector('[type="submit"]');

  if (!form || !galleryInput || !cameraInput || !cameraButton || !nameInput || !messageInput || !previewArea || !previewList || !counter || !clearButton || !status || !gallery || !submitButton) {
    console.error('HTML do mural incompleto: confira os IDs dos campos.');
    return;
  }

  let selectedFiles = [];
  let previewUrls = [];
  let busy = false;
  let syncRunning = false;
  let dbPromise;

  gallery.innerHTML = '<div class="empty-state"><span aria-hidden="true">✿</span><h3>Suas lembranças estão protegidas</h3><p>Somente Gleice e Júlio terão acesso às fotos enviadas.</p></div>';

  function setStatus(message, error = false) {
    status.textContent = message;
    status.style.color = error ? '#a33b32' : '';
  }

  function setOfflineInfo(message) {
    if (offlineInfo) offlineInfo.textContent = message;
  }

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('Este navegador não oferece armazenamento offline.'));
        return;
      }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Não foi possível abrir o armazenamento do aparelho.'));
    });
    return dbPromise;
  }

  async function queueAdd(record) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Não foi possível guardar uma foto no aparelho.'));
      tx.onabort = () => reject(tx.error || new Error('O armazenamento offline foi interrompido.'));
    });
  }

  async function queueAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve((request.result || []).sort((a, b) => a.createdAt - b.createdAt));
      request.onerror = () => reject(request.error || new Error('Não foi possível consultar as fotos pendentes.'));
    });
  }

  async function queueDelete(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Não foi possível atualizar a fila de envio.'));
    });
  }

  async function updatePendingInfo() {
    try {
      const pending = await queueAll();
      if (pending.length) {
        setOfflineInfo(`${pending.length} foto(s) guardadas neste aparelho e aguardando confirmação no Drive. Não apague os dados do navegador.`);
      } else {
        setOfflineInfo('As fotos ficam guardadas neste aparelho até serem confirmadas no Drive.');
      }
      return pending;
    } catch (error) {
      setOfflineInfo(error.message);
      return [];
    }
  }

  function releasePreviews() {
    previewUrls.forEach(url => URL.revokeObjectURL(url));
    previewUrls = [];
  }

  function renderPreviews() {
    releasePreviews();
    previewList.innerHTML = '';
    previewArea.hidden = selectedFiles.length === 0;
    counter.textContent = `${selectedFiles.length} de ${MAX_FILES} fotos selecionadas`;
    selectedFiles.forEach((file, index) => {
      const url = URL.createObjectURL(file);
      previewUrls.push(url);
      const card = document.createElement('div');
      const img = document.createElement('img');
      img.src = url;
      img.alt = `Prévia da foto ${index + 1}`;
      img.style.cssText = 'width:100%;height:85px;object-fit:cover;border-radius:4px;';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove-photo';
      remove.textContent = 'Remover';
      remove.addEventListener('click', () => {
        if (busy) return;
        selectedFiles.splice(index, 1);
        renderPreviews();
        setStatus('Foto removida da seleção.');
      });
      card.append(img, remove);
      previewList.appendChild(card);
    });
  }

  function addFiles(fileList) {
    if (busy) return;
    let added = 0;
    let rejected = 0;
    for (const file of Array.from(fileList || [])) {
      if (!file.type.startsWith('image/') || file.size > MAX_ORIGINAL_BYTES || selectedFiles.length >= MAX_FILES) {
        rejected++;
        continue;
      }
      selectedFiles.push(file);
      added++;
    }
    renderPreviews();
    if (rejected) setStatus(`${added} foto(s) adicionadas. Alguns arquivos foram ignorados. Limite: 50 fotos e 15 MB por arquivo.`, true);
    else if (added) setStatus(`${added} foto(s) adicionadas à seleção.`);
  }

  galleryInput.multiple = true;
  galleryInput.accept = 'image/*';
  galleryInput.removeAttribute('capture');
  galleryInput.removeAttribute('required');
  galleryInput.addEventListener('change', () => {
    addFiles(galleryInput.files);
    galleryInput.value = '';
  });

  cameraInput.accept = 'image/*';
  cameraInput.setAttribute('capture', 'environment');
  cameraButton.addEventListener('click', () => { if (!busy) cameraInput.click(); });
  cameraInput.addEventListener('change', () => {
    addFiles(cameraInput.files);
    cameraInput.value = '';
  });

  clearButton.addEventListener('click', () => {
    if (busy) return;
    selectedFiles = [];
    renderPreviews();
    setStatus('Seleção limpa.');
  });

  async function compressImage(file) {
    let source, width, height, cleanup = () => {};
    if ('createImageBitmap' in window) {
      source = await createImageBitmap(file);
      width = source.width;
      height = source.height;
      cleanup = () => source.close && source.close();
    } else {
      const url = URL.createObjectURL(file);
      source = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      });
      width = source.naturalWidth;
      height = source.naturalHeight;
      cleanup = () => URL.revokeObjectURL(url);
    }
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Não foi possível processar a imagem.');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      let quality = 0.78;
      let blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      while (blob && blob.size > MAX_COMPRESSED_BYTES && quality > 0.38) {
        quality -= 0.08;
        blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      }
      if (!blob || blob.size > MAX_COMPRESSED_BYTES) throw new Error('Uma foto não pôde ser reduzida para menos de 2 MB.');
      return blob;
    } finally {
      canvas.width = 1;
      canvas.height = 1;
      cleanup();
    }
  }

  function toBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(new Error('Falha ao preparar uma foto.'));
      reader.readAsDataURL(blob);
    });
  }

  async function transmitRecord(record) {
    const base64 = await toBase64(record.blob);
    return new Promise((resolve, reject) => {
      const frameName = 'gj_frame_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      const frame = document.createElement('iframe');
      frame.name = frameName;
      frame.style.display = 'none';
      const transport = document.createElement('form');
      transport.method = 'POST';
      transport.action = WEB_APP_URL;
      transport.target = frameName;
      transport.style.display = 'none';
      const field = document.createElement('input');
      field.type = 'hidden';
      field.name = 'payload';
      field.value = JSON.stringify({ action: 'upload', name: record.name, message: record.message,
        files: [{ photoId: record.id, mimeType: 'image/jpeg', base64 }] });
      transport.appendChild(field);
      document.body.append(frame, transport);
      let finished = false;
      let timer;
      const cleanup = () => { window.removeEventListener('message', onMessage); clearTimeout(timer); frame.remove(); transport.remove(); };
      const finish = (error, result) => { if (finished) return; finished = true; cleanup(); error ? reject(error) : resolve(result); };
      const onMessage = event => {
        if (event.source !== frame.contentWindow || !event.data || event.data.type !== 'gj-upload-result') return;
        const result = event.data.result;
        if (result && result.ok) finish(null, result);
        else finish(new Error(result && result.error ? result.error : 'O Drive não confirmou o envio.'));
      };
      window.addEventListener('message', onMessage);
      timer = setTimeout(() => finish(new Error('Tempo de espera esgotado. A foto continuará salva e poderá ser reenviada.')), 120000);
      try { transport.submit(); } catch (error) { finish(error); }
    });
  }

  async function syncQueue() {
    if (syncRunning || !navigator.onLine) return;
    syncRunning = true;
    try {
      let pending = await queueAll();
      if (!pending.length) return;
      setStatus(`Conexão disponível. Enviando ${pending.length} foto(s) que estavam guardadas...`);
      let sent = 0;
      for (const record of pending) {
        if (!navigator.onLine) throw new Error('A conexão caiu. As fotos continuam salvas neste aparelho.');
        setStatus(`Enviando foto ${sent + 1} de ${pending.length}...`);
        await transmitRecord(record);
        await queueDelete(record.id);
        sent++;
        await updatePendingInfo();
        setStatus(`${sent} de ${pending.length} foto(s) pendentes enviadas.`);
      }
      setStatus(`Pronto! ${sent} foto(s) enviadas em privado para Gleice e Júlio. ♥`);
    } catch (error) {
      console.error(error);
      setStatus(`${error.message} Nada foi apagado da fila; tente novamente quando a conexão estiver estável.`, true);
    } finally {
      syncRunning = false;
      await updatePendingInfo();
    }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const name = nameInput.value.trim();
    const message = messageInput.value.trim();
    if (!name) { setStatus('Informe seu nome.', true); nameInput.focus(); return; }
    if (!selectedFiles.length) { setStatus('Escolha pelo menos uma foto da galeria ou tire uma foto.', true); return; }

    busy = true;
    [galleryInput, cameraInput, cameraButton, clearButton, submitButton].forEach(el => el.disabled = true);
    const total = selectedFiles.length;
    let saved = 0;
    try {
      for (let i = 0; i < total; i++) {
        setStatus(`Preparando e guardando foto ${i + 1} de ${total} neste aparelho...`);
        const blob = await compressImage(selectedFiles[i]);
        const id = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-${i}`;
        await queueAdd({ id, blob, name, message, createdAt: Date.now() + i });
        saved++;
        await updatePendingInfo();
      }
      selectedFiles = [];
      renderPreviews();
      form.reset();
      setStatus(`${saved} foto(s) guardadas neste aparelho. ${navigator.onLine ? 'Iniciando o envio...' : 'Quando você abrir este site novamente com internet, o envio será retomado.'}`);
      if (navigator.onLine) await syncQueue();
    } catch (error) {
      console.error(error);
      if (saved > 0) {
        selectedFiles.splice(0, saved);
        renderPreviews();
      }
      setStatus(`${saved} foto(s) foram guardadas. ${error.message} Mantenha este navegador e os dados do site no aparelho.`, true);
    } finally {
      busy = false;
      [galleryInput, cameraInput, cameraButton, clearButton, submitButton].forEach(el => el.disabled = false);
      await updatePendingInfo();
    }
  });

  window.addEventListener('online', () => {
    setStatus('Internet detectada. Retomando o envio das fotos guardadas...');
    syncQueue();
  });
  window.addEventListener('pageshow', () => { if (navigator.onLine) syncQueue(); });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').then(() => navigator.serviceWorker.ready).then(() => {
        setOfflineInfo('Modo offline preparado neste aparelho. Selecione as fotos mesmo sem internet; o envio será retomado quando abrir o site conectado.');
      }).catch(error => console.warn('Não foi possível preparar o modo offline:', error));
    });
  }

  renderPreviews();
  setStatus('Escolha fotos da galeria ou tire uma foto.');
  updatePendingInfo().then(() => { if (navigator.onLine) syncQueue(); });
})();
