
// Mural de fotos - Gleice e Júlio
// Seleção de várias fotos + câmera + compressão no navegador.
// ATENÇÃO: esta versão ainda salva no navegador (localStorage), não no Google Drive.

const formFoto = document.getElementById('formFoto');
const inputFoto = document.getElementById('inputFoto');
const nomeConvidado = document.getElementById('nomeConvidado');
const mensagemConvidado = document.getElementById('mensagemConvidado');
const previewArea = document.getElementById('previewArea');
const previewFoto = document.getElementById('previewFoto');
const removerFoto = document.getElementById('removerFoto');
const mural = document.getElementById('gradeFotos');
const statusEnvio = document.getElementById('statusEnvio');
const modalFoto = document.getElementById('modalFoto');
const imagemExpandida = document.getElementById('imagemExpandida');
const autorExpandido = document.getElementById('autorExpandido');
const recadoExpandido = document.getElementById('recadoExpandido');
const btnFecharModal = document.getElementById('btnFecharModal');

let fotosSelecionadas = [];
let urlsPreview = [];
const STORAGE_KEY = 'gleice-julio-mural-v1';
const TAMANHO_MAXIMO_ORIGINAL = 15 * 1024 * 1024;
const MAX_FOTOS_POR_ENVIO = 5;
const LADO_MAXIMO = 1280;
const QUALIDADE_JPEG = 0.70;

function lerFotos() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch (erro) {
    return [];
  }
}

// ----- Seleção de várias fotos -----
inputFoto.accept = 'image/*';
inputFoto.multiple = true;
inputFoto.required = false;
inputFoto.removeAttribute('required');
inputFoto.removeAttribute('capture');

// A área antiga de prévia passa a mostrar uma lista de miniaturas.
if (previewFoto) previewFoto.hidden = true;

const listaPreviews = document.createElement('div');
listaPreviews.id = 'listaPreviewsFotos';
listaPreviews.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:10px;width:100%;';
previewArea.appendChild(listaPreviews);

function atualizarPreviews() {
  urlsPreview.forEach((url) => URL.revokeObjectURL(url));
  urlsPreview = [];
  listaPreviews.innerHTML = '';

  if (fotosSelecionadas.length === 0) {
    previewArea.hidden = true;
    return;
  }

  previewArea.hidden = false;

  fotosSelecionadas.forEach((arquivo, indice) => {
    const url = URL.createObjectURL(arquivo);
    urlsPreview.push(url);

    const item = document.createElement('div');
    item.style.cssText = 'position:relative;min-width:0;';

    const img = document.createElement('img');
    img.src = url;
    img.alt = `Foto ${indice + 1} selecionada`;
    img.style.cssText = 'width:100%;height:90px;object-fit:cover;border-radius:8px;display:block;';

    const legenda = document.createElement('small');
    legenda.textContent = `Foto ${indice + 1}`;
    legenda.style.cssText = 'display:block;text-align:center;margin-top:4px;';

    item.append(img, legenda);
    listaPreviews.appendChild(item);
  });

  statusEnvio.textContent = `${fotosSelecionadas.length} foto(s) selecionada(s). Nome e mensagem serão usados em todas.`;
}

function adicionarArquivos(arquivos) {
  const novos = Array.from(arquivos || []);
  let adicionadas = 0;
  let ignoradas = 0;

  for (const arquivo of novos) {
    if (!arquivo.type || !arquivo.type.startsWith('image/')) {
      ignoradas++;
      continue;
    }

    if (arquivo.size > TAMANHO_MAXIMO_ORIGINAL) {
      ignoradas++;
      continue;
    }

    if (fotosSelecionadas.length >= MAX_FOTOS_POR_ENVIO) {
      ignoradas += novos.length - novos.indexOf(arquivo);
      break;
    }

    fotosSelecionadas.push(arquivo);
    adicionadas++;
  }

  atualizarPreviews();

  if (ignoradas > 0) {
    statusEnvio.textContent = `${adicionadas} foto(s) adicionada(s). Algumas foram ignoradas: limite de ${MAX_FOTOS_POR_ENVIO} por envio, arquivos não-imagem ou acima de 15 MB.`;
  } else if (adicionadas > 0) {
    statusEnvio.textContent = `${fotosSelecionadas.length} foto(s) selecionada(s). Nome e mensagem serão usados em todas.`;
  }
}

inputFoto.addEventListener('change', () => {
  adicionarArquivos(inputFoto.files);
  inputFoto.value = '';
});

// Botão para abrir a câmera do celular.
// Cada foto tirada é acrescentada à seleção.
const inputCamera = document.createElement('input');
inputCamera.type = 'file';
inputCamera.accept = 'image/*';
inputCamera.setAttribute('capture', 'environment');
inputCamera.hidden = true;
inputCamera.setAttribute('aria-label', 'Tirar foto com a câmera');

const botaoCamera = document.createElement('button');
botaoCamera.type = 'button';
botaoCamera.textContent = 'Tirar foto';
botaoCamera.className = 'btn-camera';
botaoCamera.style.cssText = 'display:inline-block;margin:8px 0;padding:10px 16px;border:1px solid #9b7955;border-radius:8px;background:#fffaf3;color:#654b35;font:inherit;cursor:pointer;';

botaoCamera.addEventListener('click', () => inputCamera.click());

inputCamera.addEventListener('change', () => {
  adicionarArquivos(inputCamera.files);
  inputCamera.value = '';
});

const pontoInsercao = inputFoto.closest('label') || inputFoto;
pontoInsercao.insertAdjacentElement('afterend', inputCamera);
inputCamera.insertAdjacentElement('afterend', botaoCamera);

// O botão existente agora limpa todas as fotos selecionadas.
removerFoto.addEventListener('click', () => {
  fotosSelecionadas = [];
  inputFoto.value = '';
  inputCamera.value = '';
  atualizarPreviews();
  statusEnvio.textContent = 'Seleção de fotos limpa.';
});

// ----- Compressão -----
async function comprimirImagem(file) {
  let bitmap;
  let largura;
  let altura;
  let desenhar;
  let limparImagem = () => {};

  if ('createImageBitmap' in window) {
    bitmap = await createImageBitmap(file);
    largura = bitmap.width;
    altura = bitmap.height;
    desenhar = (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h);
  } else {
    const urlTemporaria = URL.createObjectURL(file);
    limparImagem = () => URL.revokeObjectURL(urlTemporaria);

    const imagem = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = urlTemporaria;
    });

    largura = imagem.naturalWidth;
    altura = imagem.naturalHeight;
    desenhar = (ctx, w, h) => ctx.drawImage(imagem, 0, 0, w, h);
  }

  const escala = Math.min(1, LADO_MAXIMO / Math.max(largura, altura));
  const novaLargura = Math.max(1, Math.round(largura * escala));
  const novaAltura = Math.max(1, Math.round(altura * escala));

  const canvas = document.createElement('canvas');
  canvas.width = novaLargura;
  canvas.height = novaAltura;

  const contexto = canvas.getContext('2d', { alpha: false });

  try {
    desenhar(contexto, novaLargura, novaAltura);

    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Não foi possível comprimir a imagem.'));
      }, 'image/jpeg', QUALIDADE_JPEG);
    });
  } finally {
    canvas.width = 1;
    canvas.height = 1;

    if (bitmap && bitmap.close) bitmap.close();
    limparImagem();
  }
}

function blobParaDataURL(blob) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result);
    leitor.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    leitor.readAsDataURL(blob);
  });
}

// ----- Modal -----
function abrirModal(foto) {
  imagemExpandida.src = foto.imagem;
  autorExpandido.textContent = foto.nome;
  recadoExpandido.textContent = foto.mensagem || '';

  modalFoto.classList.add('open');
  modalFoto.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function fecharModal() {
  modalFoto.classList.remove('open');
  modalFoto.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  imagemExpandida.src = '';
}

btnFecharModal.addEventListener('click', fecharModal);

modalFoto.addEventListener('click', (event) => {
  if (event.target === modalFoto) fecharModal();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') fecharModal();
});

// ----- Mural -----
function renderizarMural() {
  const fotos = lerFotos();
  mural.innerHTML = '';

  if (!fotos.length) {
    mural.innerHTML = '<div class="empty-state"><span aria-hidden="true">✿</span><h3>A primeira lembrança pode ser sua!</h3><p>Envie uma foto para começar a montar nosso mural.</p></div>';
    return;
  }

  fotos.slice().reverse().forEach((foto) => {
    const card = document.createElement('article');
    card.className = 'photo-card';

    const img = document.createElement('img');
    img.src = foto.imagem;
    img.alt = `Foto compartilhada por ${foto.nome}`;
    img.loading = 'lazy';
    img.addEventListener('click', () => abrirModal(foto));

    const nome = document.createElement('p');
    nome.className = 'photo-name';
    nome.textContent = foto.nome;

    card.append(img, nome);

    if (foto.mensagem) {
      const mensagem = document.createElement('p');
      mensagem.className = 'photo-message';
      mensagem.textContent = foto.mensagem;
      card.append(mensagem);
    }

    mural.append(card);
  });
}

// ----- Envio em lote -----
formFoto.addEventListener('submit', async (event) => {
  event.preventDefault();

  const nome = nomeConvidado.value.trim();
  const mensagem = mensagemConvidado.value.trim();

  if (!nome || fotosSelecionadas.length === 0) {
    statusEnvio.textContent = 'Preencha seu nome e selecione pelo menos uma foto.';
    return;
  }

  const botaoEnviar = formFoto.querySelector('[type="submit"]');
  if (botaoEnviar) botaoEnviar.disabled = true;

  try {
    const fotosSalvas = lerFotos();
    const novasFotos = [];

    for (let i = 0; i < fotosSelecionadas.length; i++) {
      statusEnvio.textContent = `Preparando foto ${i + 1} de ${fotosSelecionadas.length}...`;

      const comprimida = await comprimirImagem(fotosSelecionadas[i]);
      const imagem = await blobParaDataURL(comprimida);

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
      
