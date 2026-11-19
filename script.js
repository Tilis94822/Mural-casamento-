
(() => {
  'use strict';

  // CONFIGURAÇÃO DO GOOGLE APPS SCRIPT
  const WEB_APP_URL =
    'https://script.google.com/macros/s/AKfycbx5mLQhSGBeSvz6Ad6VPHaE0tFM75saawEB4QDqdki--CXge0fwWZvYgCc8urU88ugF/exec';

  const MAX_FILES = 50;
  const BATCH_SIZE = 5;
  const MAX_ORIGINAL_SIZE = 15 * 1024 * 1024;
  const MAX_COMPRESSED_SIZE = 2 * 1024 * 1024;
  const MAX_IMAGE_SIDE = 1600;

  const $ = id => document.getElementById(id);

  const form = $('formFoto');
  const galleryInput = $('inputFoto');
  const cameraInput = $('cameraInput');

  const galleryButton = $('btnGaleria');
  const cameraButton = $('btnCamera');
  const submitButton = $('btnEnviar');

  const nameInput = $('nomeConvidado');
  const messageInput = $('mensagemConvidado');

  const previewArea = $('previewArea');
  const previewList = $('listaPreviewsFotos');
  const counter = $('contadorFotos');
  const clearButton = $('removerFoto');
  const status = $('statusEnvio');

  if (
    !form || !galleryInput || !cameraInput ||
    !galleryButton || !cameraButton ||
    !submitButton || !nameInput ||
    !messageInput || !previewArea ||
    !previewList || !counter ||
    !clearButton || !status
  ) {
    console.error('Erro: elementos necessários não encontrados no HTML.');
    return;
  }

  let selectedFiles = [];
  let previewUrls = [];
  let uploading = false;

  // ==================================================
  // CONFIGURAÇÃO DOS SELETORES
  // ==================================================

  // GALERIA: múltiplas imagens e SEM capture.
  galleryInput.type = 'file';
  galleryInput.accept = 'image/*';
  galleryInput.multiple = true;
  galleryInput.removeAttribute('capture');
  galleryInput.removeAttribute('required');

  // CÂMERA: apenas uma foto por vez.
  cameraInput.type = 'file';
  cameraInput.accept = 'image/*';
  cameraInput.setAttribute('capture', 'environment');
  cameraInput.multiple = false;

  // ==================================================
  // ABRIR GALERIA
  // ==================================================

  galleryButton.addEventListener('click', () => {
    if (uploading) return;

    // Abre diretamente o seletor associado ao campo da galeria.
    galleryInput.click();
  });

  // ==================================================
  // ABRIR CÂMERA
  // ==================================================

  cameraButton.addEventListener('click', () => {
    if (uploading) return;

    cameraInput.click();
  });

  // ==================================================
  // MENSAGENS DE STATUS
  // ==================================================

  function setStatus(message, error = false) {
    status.textContent = message;
    status.style.color = error ? '#b33b32' : '';
  }

  // ==================================================
  // LIMPAR PRÉVIAS
  // ==================================================

  function clearPreviewUrls() {
    previewUrls.forEach(url => URL.revokeObjectURL(url));
    previewUrls = [];
  }

  // ==================================================
  // MOSTRAR FOTOS SELECIONADAS
  // ==================================================

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
      card.className = 'card-foto';

      const image = document.createElement('img');
      image.src = url;
      image.alt = `Foto selecionada ${index + 1}`;

      const label = document.createElement('p');
      label.textContent = `Foto ${index + 1}`;
      label.className = 'autor';

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.textContent = 'Remover';

      removeButton.addEventListener('click', () => {
        if (uploading) return;

        selectedFiles.splice(index, 1);

        renderPreviews();
        setStatus('Foto removida da seleção.');
      });

      card.appendChild(image);
      card.appendChild(label);
      card.appendChild(removeButton);

      previewList.appendChild(card);
    });
  }

  // ==================================================
  // ADICIONAR FOTOS
  // ==================================================

  function addFiles(fileList) {
    if (uploading) return;

    const files = Array.from(fileList || []);

    let added = 0;
    let rejected = 0;

    for (const file of files) {
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
        `${added} foto(s) adicionadas. Alguns arquivos foram ignorados. Limite: 50 fotos e 15 MB por foto.`,
        true
      );
    } else if (added > 0) {
      setStatus(
        `${added} foto(s) adicionadas. Você pode escolher mais fotos ou tirar uma foto.`
      );
    }
  }

  // ==================================================
  // RECEBER FOTOS DA GALERIA
  // ==================================================

  galleryInput.addEventListener('change', () => {
    addFiles(galleryInput.files);

    // Permite escolher novamente os mesmos arquivos.
    galleryInput.value = '';
  });

  // ==================================================
  // RECEBER FOTOS DA CÂMERA
  // ==================================================

  cameraInput.addEventListener('change', () => {
    addFiles(cameraInput.files);
    cameraInput.value = '';
  });

  // ==================================================
  // REMOVER TODAS AS FOTOS
  // ==================================================

  clearButton.addEventListener('click', () => {
    if (uploading) return;

    selectedFiles = [];

    renderPreviews();

    setStatus('Todas as fotos foram removidas.');
  });

  // ==================================================
  // COMPACTAR IMAGEM
  // ==================================================

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
        img.onerror = () => reject(
          new Error('Não foi possível abrir uma imagem.')
        );

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

      context.drawImage(
        image,
        0,
        0,
        canvas.width,
        canvas.height
      );

      let quality = 0.78;

      let blob = await new Promise(resolve => {
        canvas.toBlob(resolve, 'image/jpeg', quality);
      });

      while (
        blob &&
        blob.size > MAX_COMPRESSED_SIZE &&
        quality > 0.38
      ) {
        quality -= 0.08;

        blob = await new Promise(resolve => {
          canvas.toBlob(resolve, 'image/jpeg', quality);
        });
      }

      if (!blob || blob.size > MAX_COMPRESSED_SIZE) {
        throw new Error(
          'Uma foto não pôde ser reduzida para menos de 2 MB.'
        );
      }

      return blob;

    } finally {
      canvas.width = 1;
      canvas.height = 1;
      cleanup();
    }
  }

  // ==================================================
  // CONVERTER IMAGEM PARA BASE64
  // ==================================================

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const result = String(reader.result);
        resolve(result.split(',')[1]);
      };

      reader.onerror = () => {
        reject(new Error('Falha ao preparar uma foto.'));
      };

      reader.readAsDataURL(blob);
    });
  }

  // ==================================================
  // ENVIAR LOTE AO GOOGLE DRIVE
  // ==================================================

  function sendBatch(payload) {
    return new Promise((resolve, reject) => {
      const frameName =
        'gj_frame_' + Date.now() + '_' +
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

      const onMessage = event => {
        if (event.source !== frame.contentWindow) return;

        if (
          !event.data ||
          event.data.type !== 'gj-upload-result'
        ) {
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
      };

      const timeout = setTimeout(() => {
        finish(
          new Error(
            'Tempo de espera esgotado. Verifique o Apps Script.'
          )
        );
      }, 90000);

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

      window.addEventListener('message', onMessage);

      try {
        transport.submit();
      } catch (error) {
        finish(error);
      }
    });
  }

  // ==================================================
  // ENVIAR FORMULÁRIO
  // ==================================================

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
      setStatus('Escolha pelo menos uma foto.', true);
      return;
    }

    uploading = true;

    galleryButton.disabled = true;
    cameraButton.disabled = true;
    submitButton.disabled = true;
    clearButton.disabled = true;

    galleryInput.disabled = true;
    cameraInput.disabled = true;

    const total = selectedFiles.length;
    let uploaded = 0;

    try {
      for (
        let start = 0;
        start < total;
        start += BATCH_SIZE
      ) {
        const batch = selectedFiles.slice(
          start,
          start + BATCH_SIZE
        );

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

      galleryButton.disabled = false;
      cameraButton.disabled = false;
      submitButton.disabled = false;
      clearButton.disabled = false;

      galleryInput.disabled = false;
      cameraInput.disabled = false;
    }
  });

  // ==================================================
  // INICIALIZAÇÃO
  // ==================================================

  renderPreviews();

  setStatus(
    'Escolha fotos da galeria ou tire uma foto.'
  );

})();
        nput');
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
      
