
// Mural Gleice & Júlio — envio privado para o Google Drive.
// Até 50 fotos por envio, transmitidas em lotes de 5.

(() => {
  'use strict';

  const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbx5mLQhSGBeSvz6Ad6VPHaE0tFM75saawEB4QDqdki--CXge0fwWZvYgCc8urU88ugF/exec';
  const MAX_FILES = 50;
  const BATCH_SIZE = 5;
  const MAX_ORIGINAL_BYTES = 15 * 1024 * 1024;
  const MAX_COMPRESSED_BYTES = 2 * 1024 * 1024;
  const MAX_SIDE = 1600;
  const JPEG_QUALITY = 0.72;

  const $ = (id) => document.getElementById(id);
  const form = $('formFoto');
  const fileInput = $('inputFoto');
  const nameInput = $('nomeConvidado');
  const messageInput = $('mensagemConvidado');
  const previewArea = $('previewArea');
  const oldPreview = $('previewFoto');
  const clearButton = $('removerFoto');
  const status = $('statusEnvio');
  const mural = $('gradeFotos');

  if (!form || !fileInput || !nameInput || !messageInput || !previewArea || !clearButton || !status || !mural) {
    console.error('O HTML do mural não contém todos os elementos esperados.');
    return;
  }

  let selectedFiles = [];
  let previewUrls = [];
  let busy = false;
  let activeRequestId = null;
  let timeoutHandle = null;

  // O mural não lista arquivos de ninguém. Mostra apenas instrução de privacidade.
  mural.innerHTML = '<div class="empty-state"><span aria-hidden="true">♡</span><h3>Suas lembranças são privadas</h3><p>Somente Gleice e Júlio terão acesso às fotos enviadas.</p></div>';
  const privacyNote = form.querySelector('.privacy-note');
  if (privacyNote) privacyNote.textContent = 'Suas fotos serão enviadas em privado para Gleice e Júlio. Outros convidados não poderão vê-las.';
  const submitButton = form.querySelector('[type="submit"]');
  if (submitButton) submitButton.innerHTML = 'Enviar fotos <span aria-hidden="true">♡</span>';

  fileInput.multiple = true;
  fileInput.required = false;
  fileInput.removeAttribute('required');
  fileInput.removeAttribute('capture');
  fileInput.accept = 'image/jpeg,image/png,image/webp,image/*';
  if (oldPreview) oldPreview.hidden = true;

  const previewList = document.createElement('div');
  previewList.id = 'listaPreviewsFotos';
  previewList.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(76px,1fr));gap:9px;width:100%;';
  previewArea.appendChild(previewList);

  const counter = document.createElement('p');
  counter.id = 'contadorFotos';
  counter.className = 'status';
  previewArea.appendChild(counter);

  // Botão separado para câmera: cada foto tirada entra na seleção existente.
  const cameraInput = document.createElement('input');
  cameraInput.type = 'file';
  cameraInput.accept = 'image/*';
  cameraInput.capture = 'environment';
  cameraInput.hidden = true;
  const cameraButton = document.createElement('button');
  cameraButton.type = 'button';
  cameraButton.className = 'remove-photo';
  cameraButton.textContent = 'Tirar uma foto';
  cameraButton.style.marginTop = '10px';
  const pickerLabel = form.querySelector('label[for="inputFoto"]');
  if (pickerLabel) pickerLabel.insertAdjacentElement('afterend', cameraButton);
  form.appendChild(cameraInput);
  cameraButton.addEventListener('click', () => cameraInput.click());
  cameraInput.addEventListener('change', () => {
    addFiles(cameraInput.files);
    cameraInput.value = '';
  });

  function setStatus(text, isError = false) {
    status.textContent = text;
    status.style.color = isError ? '#a33b32' : '';
  }

  function clearPreviews() {
    previewUrls.forEach(URL.revokeObjectURL);
    previewUrls = [];
    previewList.innerHTML = '';
  }

  function renderPreviews() {
    clearPreviews();
    previewArea.hidden = selectedFiles.length === 0;
    counter.textContent = selectedFiles.length + ' de ' + MAX_FILES + ' fotos selecionadas';
    selectedFiles.forEach((file, index) => {
      const url = URL.createObjectURL(file);
      previewUrls.push(url);
      const card = document.createElement('div');
      const img = document.createElement('img');
      img.src = url;
      img.alt = 'Prévia da foto ' + (index + 1);
      img.style.cssText = 'width:100%;height:76px;object-fit:cover;border-radius:8px;display:block;';
      const label = document.createElement('small');
      label.textContent = 'Foto ' + (index + 1);
      label.style.cssText = 'display:block;text-align:center;margin-top:3px;';
      card.append(img, label);
      previewList.appendChild(card);
    });
  }

  function addFiles(fileList) {
    if (busy) return;
    let rejected = 0;
    Array.from(fileList || []).forEach((file) => {
      if (selectedFiles.length >= MAX_FILES) { rejected++; return; }
      if (!file.type.startsWith('image/')) { rejected++; return; }
      if (file.size > MAX_ORIGINAL_BYTES) { rejected++; return; }
      selectedFiles.push(file);
    });
    renderPreviews();
    if (rejected) setStatus('Alguns arquivos foram ignorados. Limite: 50 fotos e 15 MB por foto original.', true);
    else setStatus(selectedFiles.length ? 'Seleção pronta. Nome e mensagem serão aplicados a todas as fotos.' : 'Escolha suas fotos.');
  }

  fileInput.addEventListener('change', () => {
    addFiles(fileInput.files);
    fileInput.value = '';
  });

  clearButton.textContent = 'Remover todas as fotos';
  clearButton.addEventListener('click', () => {
    if (busy) return;
    selectedFiles = [];
    renderPreviews();
    setStatus('Seleção limpa.');
  });
  
  async function compressImage(file) {
    let source;
    let width;
    let height;
    let release = () => {};
    if ('createImageBitmap' in window) {
      source = await createImageBitmap(file);
      width = source.width;
      height = source.height;
      release = () => source.close && source.close();
    } else {
      const url = URL.createObjectURL(file);
      source = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = url;
      });
      width = source.naturalWidth;
      height = source.naturalHeight;
      release = () => URL.revokeObjectURL(url);
    }

    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    try {
      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      let quality = JPEG_QUALITY;
      let blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      while (blob && blob.size > MAX_COMPRESSED_BYTES && quality > 0.42) {
        quality -= 0.08;
        blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      }
      if (!blob || blob.size > MAX_COMPRESSED_BYTES) throw new Error('Uma foto não pôde ser reduzida para menos de 2 MB. Escolha uma imagem menor.');
      return blob;
    } finally {
      canvas.width = 1;
      canvas.height = 1;
      release();
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(new Error('Falha ao preparar uma foto.'));
      reader.readAsDataURL(blob);
    });
  }

  function sendBatch(payload) {
    return new Promise((resolve, reject) => {
      const requestId = 'gj-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      activeRequestId = requestId;
      const frameName = 'gj_upload_frame';
      let frame = document.querySelector('iframe[name="' + frameName + '"]');
      if (!frame) {
        frame = document.createElement('iframe');
        frame.name = frameName;
        frame.style.display = 'none';
        document.body.appendChild(frame);
      }
      const formTransport = document.createElement('form');
      formTransport.method = 'POST';
      formTransport.action = WEB_APP_URL;
      formTransport.target = frameName;
      formTransport.style.display = 'none';
      const field = document.createElement('input');
      field.type = 'hidden';
      field.name = 'payload';
      field.value = JSON.stringify(payload);
      formTransport.appendChild(field);
      document.body.appendChild(formTransport);

      const onMessage = (event) => {
        if (event.source !== frame.contentWindow || !event.data || event.data.type !== 'gj-upload-result') return;
        window.removeEventListener('message', onMessage);
        clearTimeout(timeoutHandle);
        formTransport.remove();
        if (event.data.result && event.data.result.ok) resolve(event.data.result);
        else reject(new Error(event.data.result && event.data.result.error || 'O servidor não conseguiu salvar este lote.'));
      };
      window.addEventListener('message', onMessage);
      timeoutHandle = setTimeout(() => {
        window.removeEventListener('message', onMessage);
        formTransport.remove();
        reject(new Error('O servidor demorou para responder. Verifique a implantação do Apps Script e tente novamente.'));
      }, 90000);
      formTransport.submit();
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const guestName = nameInput.value.trim();
    const message = messageInput.value.trim();
    if (!guestName) { setStatus('Informe seu nome.', true); nameInput.focus(); return; }
    if (!selectedFiles.length) { setStatus('Selecione pelo menos uma foto.', true); return; }

    busy = true;
    if (submitButton) submitButton.disabled = true;
    cameraButton.disabled = true;
    clearButton.disabled = true;
    fileInput.disabled = true;
    let uploaded = 0;

    try {
      const total = selectedFiles.length;
      for (let start = 0; start < total; start += BATCH_SIZE) {
        const batchFiles = selectedFiles.slice(start, start + BATCH_SIZE);
        const encoded = [];
        for (let i = 0; i < batchFiles.length; i++) {
          setStatus('Preparando foto ' + (start + i + 1) + ' de ' + total + '...');
          const blob = await compressImage(batchFiles[i]);
          encoded.push({ mimeType: 'image/jpeg', base64: await blobToBase64(blob) });
        }
        setStatus('Enviando ' + Math.min(start + batchFiles.length, total) + ' de ' + total + ' fotos...');
        await sendBatch({ action: 'upload', name: guestName, message, files: encoded });
        uploaded += batchFiles.length;
        setStatus(uploaded + ' de ' + total + ' fotos enviadas.');
      }

      selectedFiles = [];
      renderPreviews();
      form.reset();
      setStatus('Pronto! ' + uploaded + ' foto(s) foram enviadas em privado para Gleice e Júlio. Obrigado! ♥');
    } catch (error) {
      console.error(error);
      setStatus(uploaded + ' foto(s) enviadas. O restante não foi confirmado: ' + error.message + ' Não selecione tudo novamente sem conferir o Drive.', true);
    } finally {
      busy = false;
      if (submitButton) submitButton.disabled = false;
      cameraButton.disabled = false;
      clearButton.disabled = false;
      fileInput.disabled = false;
    }
  });

  renderPreviews();
})();
        aURL(comprimida);

      novasFotos.push({
        id: `${Date.now()}-${i}-${Math.random().toString(16).slice(2)}`,
        nome,
        mensagem,
        imagem
      });
    }

    statusEnvio.textContent = 'Salvando as fotos...';

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(fotosSalvas.concat(novasFotos))
    );

    fotosSelecionadas = [];
    atualizarPreviews();
    formFoto.reset();
    renderizarMural();

    statusEnvio.textContent = `${novasFotos.length} foto(s) adicionada(s) neste dispositivo. Obrigado por compartilhar! ♥`;

    const secaoMural = document.getElementById('mural');

    if (secaoMural) {
      secaoMural.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }

  } catch (erro) {
    console.error(erro);

    statusEnvio.textContent = 'Não foi possível guardar todas as fotos. Tente enviar menos fotos por vez ou imagens menores.';

  } finally {
    if (botaoEnviar) botaoEnviar.disabled = false;
  }
});

renderizarMural();
      
