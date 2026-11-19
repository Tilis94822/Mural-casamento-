
(() => {
  'use strict';

  const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzeQJ-HCToW9tJw62YDSYL1oeZyxxzpxbg9KYqpp8GHsTa9CJ9o_fuvYjH48QW3W2PccA/exec';
  const MAX_FILES = 50;
  const BATCH_SIZE = 5;
  const MAX_ORIGINAL_BYTES = 15 * 1024 * 1024;
  const MAX_COMPRESSED_BYTES = 2 * 1024 * 1024;
  const MAX_SIDE = 1600;

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
  const gallery = $('gradeFotos');
  const submitButton = form && form.querySelector('[type="submit"]');

  if (!form || !galleryInput || !cameraInput || !cameraButton || !nameInput || !messageInput || !previewArea || !previewList || !counter || !clearButton || !status || !gallery || !submitButton) {
    console.error('HTML do mural incompleto: confira os IDs dos campos.');
    return;
  }

  let selectedFiles = [];
  let previewUrls = [];
  let uploading = false;

  gallery.innerHTML = '<div class="empty-state"><span aria-hidden="true">✿</span><h3>Suas lembranças estão protegidas</h3><p>Somente Gleice e Júlio terão acesso às fotos enviadas.</p></div>';

  function setStatus(message, error = false) {
    status.textContent = message;
    status.style.color = error ? '#a33b32' : '';
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
        if (uploading) return;
        selectedFiles.splice(index, 1);
        renderPreviews();
        setStatus('Foto removida da seleção.');
      });
      card.append(img, remove);
      previewList.appendChild(card);
    });
  }

  function addFiles(fileList) {
    if (uploading) return;
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

  // GALERIA: seleção múltipla, sem capture.
  galleryInput.multiple = true;
  galleryInput.accept = 'image/*';
  galleryInput.removeAttribute('capture');
  galleryInput.removeAttribute('required');
  galleryInput.addEventListener('change', () => {
    addFiles(galleryInput.files);
    galleryInput.value = '';
  });

  // CÂMERA: controle separado.
  cameraInput.accept = 'image/*';
  cameraInput.setAttribute('capture', 'environment');
  cameraButton.addEventListener('click', () => {
    if (!uploading) cameraInput.click();
  });
  cameraInput.addEventListener('change', () => {
    addFiles(cameraInput.files);
    cameraInput.value = '';
  });

  clearButton.addEventListener('click', () => {
    if (uploading) return;
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

      if (!blob || blob.size > MAX_COMPRESSED_BYTES) {
        throw new Error('Uma foto não pôde ser reduzida para menos de 2 MB.');
      }
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

  function sendBatch(payload) {
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
      field.value = JSON.stringify(payload);
      transport.appendChild(field);

      document.body.append(frame, transport);

      let finished = false;
      let timer;

      const cleanup = () => {
        window.removeEventListener('message', onMessage);
        clearTimeout(timer);
        frame.remove();
        transport.remove();
      };

      const finish = (error, result) => {
        if (finished) return;
        finished = true;
        cleanup();
        if (error) reject(error);
        else resolve(result);
      };

      const onMessage = event => {
        if (event.source !== frame.contentWindow || !event.data || event.data.type !== 'gj-upload-result') return;
        const result = event.data.result;
        if (result && result.ok) finish(null, result);
        else finish(new Error(result && result.error ? result.error : 'O Drive não confirmou o envio.'));
      };

      window.addEventListener('message', onMessage);
      timer = setTimeout(() => finish(new Error('Tempo de espera esgotado. Confira a implantação do Apps Script e o Drive.')), 90000);

      try {
        transport.submit();
      } catch (error) {
        finish(error);
      }
    });
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (uploading) return;

    const name = nameInput.value.trim();
    const message = messageInput.value.trim();

    if (!name) {
      setStatus('Informe seu nome.', true);
      nameInput.focus();
      return;
    }

    if (!selectedFiles.length) {
      setStatus('Escolha pelo menos uma foto da galeria ou tire uma foto.', true);
      return;
    }

    uploading = true;
    [galleryInput, cameraInput, cameraButton, clearButton, submitButton].forEach(el => el.disabled = true);

    const total = selectedFiles.length;
    let uploaded = 0;

    try {
      for (let start = 0; start < total; start += BATCH_SIZE) {
        const batch = selectedFiles.slice(start, start + BATCH_SIZE);
        const files = [];

        for (let i = 0; i < batch.length; i++) {
          setStatus(`Preparando foto ${start + i + 1} de ${total}...`);
          const blob = await compressImage(batch[i]);
          files.push({
            mimeType: 'image/jpeg',
            base64: await toBase64(blob)
          });
        }

        setStatus(`Enviando ${Math.min(start + batch.length, total)} de ${total} fotos...`);

        await sendBatch({
          action: 'upload',
          name,
          message,
          files
        });

        uploaded += batch.length;
        setStatus(`${uploaded} de ${total} fotos enviadas.`);
      }

      selectedFiles = [];
      renderPreviews();
      form.reset();
      setStatus(`Pronto! ${uploaded} foto(s) enviadas em privado para Gleice e Júlio. Obrigado! ♥`);

    } catch (error) {
      console.error(error);
      setStatus(`${uploaded} foto(s) confirmadas. O restante não foi confirmado. ${error.message} Confira o Drive antes de tentar novamente.`, true);

    } finally {
      uploading = false;
      [galleryInput, cameraInput, cameraButton, clearButton, submitButton].forEach(el => el.disabled = false);
    }
  });

  renderPreviews();
  setStatus('Escolha fotos da galeria ou tire uma foto.');
})();
    
