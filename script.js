
(() => {
  'use strict';

  // CONFIGURAÇÃO
  const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbx5mLQhSGBeSvz6Ad6VPHaE0tFM75saawEB4QDqdki--CXge0fwWZvYgCc8urU88ugF/exec';

  const MAX_FILES = 50;
  const BATCH_SIZE = 5;
  const MAX_ORIGINAL_SIZE = 15 * 1024 * 1024;
  const MAX_COMPRESSED_SIZE = 2 * 1024 * 1024;
  const MAX_IMAGE_SIDE = 1600;

  const $ = id => document.getElementById(id);

  const form = $('formFoto');
  const galleryInput = $('inputFoto');
  const nameInput = $('nomeConvidado');
  const messageInput = $('mensagemConvidado');
  const previewArea = $('previewArea');
  const clearButton = $('removerFoto');
  const status = $('statusEnvio');
  const mural = $('gradeFotos');

  if (
    !form || !galleryInput || !nameInput ||
    !messageInput || !previewArea ||
    !clearButton || !status || !mural
  ) {
    console.error('Não foi possível localizar todos os elementos do HTML.');
    return;
  }

  let selectedFiles = [];
  let previewUrls = [];
  let uploading = false;

  // CONFIGURAÇÃO DA GALERIA
  // Este campo permite escolher várias imagens.
  // Não usamos capture neste campo para não forçar a câmera.
  galleryInput.type = 'file';
  galleryInput.accept = 'image/*';
  galleryInput.multiple = true;
  galleryInput.removeAttribute('capture');
  galleryInput.removeAttribute('required');

  // A galeria não exibe fotos de outros convidados.
  mural.innerHTML = `
    <div class="empty-state">
      <h3>Suas lembranças são privadas</h3>
      <p>Somente Gleice e Júlio terão acesso às fotos enviadas.</p>
    </div>
  `;

  const privacyNote = form.querySelector('.privacy-note');

  if (privacyNote) {
    privacyNote.textContent =
      'As fotos serão enviadas em privado para Gleice e Júlio.';
  }

  // ELEMENTOS DA PRÉ-VISUALIZAÇÃO
  let previewList = $('listaPreviewsFotos');

  if (!previewList) {
    previewList = document.createElement('div');
    previewList.id = 'listaPreviewsFotos';
    previewList.style.cssText = `
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(85px, 1fr));
      gap: 10px;
      width: 100%;
      margin-top: 12px;
    `;
    previewArea.appendChild(previewList);
  }

  let counter = $('contadorFotos');

  if (!counter) {
    counter = document.createElement('p');
    counter.id = 'contadorFotos';
    counter.className = 'status';
    previewArea.appendChild(counter);
  }

  // BOTÃO EXCLUSIVO PARA A CÂMERA
  // Ele é independente do seletor da galeria.
  let cameraInput = $('cameraInputGJ');

  if (!cameraInput) {
    cameraInput = document.createElement('input');
    cameraInput.id = 'cameraInputGJ';
    cameraInput.type = 'file';
    cameraInput.accept = 'image/*';
    cameraInput.setAttribute('capture', 'environment');
    cameraInput.hidden = true;
    form.appendChild(cameraInput);
  }

  let cameraButton = $('cameraButtonGJ');

  if (!cameraButton) {
    cameraButton = document.createElement('button');
    cameraButton.id = 'cameraButtonGJ';
    cameraButton.type = 'button';
    cameraButton.textContent = 'Tirar uma foto';
    cameraButton.style.cssText = `
      display: block;
      margin: 12px 0;
      padding: 10px 16px;
      cursor: pointer;
    `;

    const galleryLabel = form.querySelector('label[for="inputFoto"]');

    if (galleryLabel) {
      galleryLabel.insertAdjacentElement('afterend', cameraButton);
    } else {
      galleryInput.insertAdjacentElement('afterend', cameraButton);
    }
  }

  // BOTÃO DA GALERIA
  const galleryLabel = form.querySelector('label[for="inputFoto"]');

  if (galleryLabel) {
    galleryLabel.textContent = 'Escolher fotos da galeria';
    galleryLabel.style.cursor = 'pointer';
  }

  // BOTÃO DE CÂMERA
  cameraButton.addEventListener('click', () => {
    if (!uploading) {
      cameraInput.click();
    }
  });

  // MENSAGENS
  function setStatus(message, error = false) {
    status.textContent = message;
    status.style.color = error ? '#b33b32' : '';
  }

  // LIMPEZA DAS PRÉVIAS
  function clearPreviewUrls() {
    previewUrls.forEach(url => URL.revokeObjectURL(url));
    previewUrls = [];
  }

  // ATUALIZAÇÃO DAS PRÉVIAS
  function renderPreviews() {
    clearPreviewUrls();
    previewList.innerHTML = '';

    previewArea.hidden = selectedFiles.length === 0;

    counter.textContent =
      `${selectedFiles.length} de ${MAX_FILES} fotos selecionadas`;

    selectedFiles.forEach((file, index) => {
      const url = URL.createObjectURL(file);
      previewUrls.push(url);

      const card = document.createElement('div');

      const image = document.createElement('img');
      image.src = url;
      image.alt = `Prévia da foto ${index + 1}`;

      image.style.cssText = `
        width: 100%;
        height: 85px;
        object-fit: cover;
        border-radius: 8px;
        display: block;
      `;

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Remover';
      remove.style.cssText = `
        width: 100%;
        margin-top: 5px;
        padding: 5px;
        font-size: 12px;
        cursor: pointer;
      `;

      remove.addEventListener('click', () => {
        if (uploading) return;

        selectedFiles.splice(index, 1);
        renderPreviews();
        setStatus('Foto removida da seleção.');
      });

      card.appendChild(image);
      card.appendChild(remove);
      previewList.appendChild(card);
    });
  }

  // ADICIONAR FOTOS À SELEÇÃO
  function addFiles(fileList) {
    if (uploading) return;

    const incoming = Array.from(fileList || []);
    let rejected = 0;
    let added = 0;

    for (const file of incoming) {
      if (!file.type.startsWith('image/')) {
        rejected++;
        continue;
      }

      if (file.size > MAX_ORIGINAL_SIZE) {
        rejected++;
        continue;
      }

      if (selectedFiles.length >= MAX_FILES) {
        rejected++;
        continue;
      }

      selectedFiles.push(file);
      added++;
    }

    renderPreviews();

    if (rejected > 0) {
      setStatus(
        `${added} foto(s) adicionada(s). Alguns arquivos foram ignorados. Limite: 50 fotos e 15 MB por foto.`,
        true
      );
    } else if (added > 0) {
      setStatus('Fotos adicionadas! Você pode escolher mais ou tirar uma foto.');
    }
  }

  // ESCOLHER VÁRIAS FOTOS DA GALERIA
  galleryInput.addEventListener('change', () => {
    addFiles(galleryInput.files);

    // Permite selecionar novamente uma imagem já escolhida.
    galleryInput.value = '';
  });

  // TIRAR UMA FOTO
  cameraInput.addEventListener('change', () => {
    addFiles(cameraInput.files);
    cameraInput.value = '';
  });

  // REMOVER TODAS AS FOTOS
  clearButton.textContent = 'Remover todas as fotos';

  clearButton.addEventListener('click', event => {
    event.preventDefault();

    if (uploading) return;

    selectedFiles = [];
    renderPreviews();
    setStatus('Todas as fotos foram removidas da seleção.');
  });

  // COMPACTAR IMAGEM
  async function compressImage(file) {
    let image;
    let width;
    let height;
    let cleanup = () => {};

    if ('createImageBitmap' in window) {
      image = await createImageBitmap(file);
      width = image.width;
      height = image.height;

      cleanup = () => {
        if (image.close) image.close();
      };
    } else {
      const url = URL.createObjectURL(file);

      image = await new Promise((resolve, reject) => {
        const img = new Image();

        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Não foi possível abrir uma imagem.'));

        img.src = url;
      });

      width = image.naturalWidth;
      height = image.naturalHeight;

      cleanup = () => URL.revokeObjectURL(url);
    }

    const scale = Math.min(
      1,
      MAX_IMAGE_SIDE / Math.max(width, height)
    );

    const canvas = document.createElement('canvas');

    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));

    try {
      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Não foi possível processar a imagem.');
      }

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      let quality = 0.78;
      let blob = await new Promise(resolve =>
        canvas.toBlob(resolve, 'image/jpeg', quality)
      );

      while (
        blob &&
        blob.size > MAX_COMPRESSED_SIZE &&
        quality > 0.38
      ) {
        quality -= 0.08;

        blob = await new Promise(resolve =>
          canvas.toBlob(resolve, 'image/jpeg', quality)
        );
      }

      if (!blob || blob.size > MAX_COMPRESSED_SIZE) {
        throw new Error('Uma foto ficou grande demais mesmo após a compressão.');
      }

      return blob;
    } finally {
      canvas.width = 1;
      canvas.height = 1;
      cleanup();
    }
  }

  // CONVERTER IMAGEM PARA BASE64
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const result = String(reader.result);
        resolve(result.split(',')[1]);
      };

      reader.onerror = () => {
        reject(new Error('Erro ao preparar a imagem para envio.'));
      };

      reader.readAsDataURL(blob);
    });
  }

  // ENVIAR UM LOTE AO GOOGLE APPS SCRIPT
  function sendBatch(payload) {
    return new Promise((resolve, reject) => {
      const frameName =
        'gj_upload_' + Date.now() + '_' +
        Math.random().toString(36).slice(2);

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

      document.body.appendChild(frame);
      document.body.appendChild(transport);

      let finished = false;

      function finish(error, result) {
        if (finished) return;
        finished = true;

        window.removeEventListener('message', onMessage);
        clearTimeout(timeout);

        transport.remove();
        frame.remove();

        if (error) reject(error);
        else resolve(result);
      }

      function onMessage(event) {
        if (event.source !== frame.contentWindow) return;

        if (!event.data || event.data.type !== 'gj-upload-result') {
          return;
        }

        const result = event.data.result;

        if (result && result.ok) {
          finish(null, result);
        } else {
          finish(
            new Error(
              result && result.error
                ? result.error
                : 'O Google Drive não confirmou o envio.'
            )
          );
        }
      }

      window.addEventListener('message', onMessage);

      const timeout = setTimeout(() => {
        finish(
          new Error(
            'Tempo de espera esgotado. Confira a implantação do Apps Script e o Google Drive.'
          )
        );
      }, 90000);

      try {
        transport.submit();
      } catch (error) {
        finish(error);
      }
    });
  }

  // ENVIO DO FORMULÁRIO
  form.addEventListener('submit', async event => {
    event.preventDefault();

    if (uploading) return;

    const guestName = nameInput.value.trim();
    const message = messageInput.value.trim();

    if (!guestName) {
      setStatus('Digite seu nome antes de enviar.', true);
      nameInput.focus();
      return;
    }

    if (selectedFiles.length === 0) {
      setStatus('Escolha pelo menos uma foto da galeria ou tire uma foto.', true);
      return;
    }

    uploading = true;

    const submitButton = form.querySelector('[type="submit"]');

    if (submitButton) submitButton.disabled = true;
    cameraButton.disabled = true;
    clearButton.disabled = true;
    galleryInput.disabled = true;
    cameraInput.disabled = true;

    const total = selectedFiles.length;
    let uploaded = 0;

    try {
      for (let start = 0; start < total; start += BATCH_SIZE) {
        const batch = selectedFiles.slice(start, start + BATCH_SIZE);
        const encodedFiles = [];

        for (let i = 0; i < batch.length; i++) {
          setStatus(
            `Preparando foto ${start + i + 1} de ${total}...`
          );

          const compressed = await compressImage(batch[i]);
          const base64 = await blobToBase64(compressed);

          encodedFiles.push({
            mimeType: 'image/jpeg',
            base64: base64
          });
        }

        setStatus(
          `Enviando ${Math.min(start + batch.length, total)} de ${total} fotos...`
        );

        await sendBatch({
          action: 'upload',
          name: guestName,
          message: message,
          files: encodedFiles
        });

        uploaded += batch.length;

        setStatus(`${uploaded} de ${total} fotos enviadas.`);
      }

      selectedFiles = [];
      renderPreviews();
      form.reset();

      setStatus(
        `Pronto! ${uploaded} foto(s) foram enviadas em privado para Gleice e Júlio. Obrigado! ♥`
      );

    } catch (error) {
      console.error('Erro no envio:', error);

      setStatus(
        `${uploaded} foto(s) confirmadas. O restante não foi confirmado. ${error.message} Confira o Drive antes de tentar novamente.`,
        true
      );

    } finally {
      uploading = false;

      if (submitButton) submitButton.disabled = false;
      cameraButton.disabled = false;
      clearButton.disabled = false;
      galleryInput.disabled = false;
      cameraInput.disabled = false;
    }
  });

  // ESTADO INICIAL
  renderPreviews();
  setStatus('Escolha fotos da galeria ou tire uma foto.');
})();
                         t, start + BATCH_SIZE);
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
      
