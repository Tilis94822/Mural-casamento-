
// Mural de fotos - Gleice e Júlio
// Câmera nativa + galeria + compressão local.
// ATENÇÃO: ainda não está conectado ao Google Drive.

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

let fotoSelecionada = null;
let previewUrl = null;

const STORAGE_KEY = 'gleice-julio-mural-v1';
const TAMANHO_MAXIMO_ORIGINAL = 15 * 1024 * 1024;
const LADO_MAXIMO = 1600;
const QUALIDADE_JPEG = 0.76;

function lerFotos() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch (erro) {
    return [];
  }
}

function limparPreview() {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  previewFoto.removeAttribute('src');
  previewArea.hidden = true;
}

function mostrarPreview(file) {
  if (!file) return;

  if (!file.type || !file.type.startsWith('image/')) {
    statusEnvio.textContent = 'Escolha um arquivo de imagem.';
    return;
  }

  if (file.size > TAMANHO_MAXIMO_ORIGINAL) {
    statusEnvio.textContent = 'Essa foto tem mais de 15 MB. Escolha uma foto menor.';
    return;
  }

  fotoSelecionada = file;

  if (previewUrl) URL.revokeObjectURL(previewUrl);

  previewUrl = URL.createObjectURL(file);
  previewFoto.src = previewUrl;
  previewArea.hidden = false;

  statusEnvio.textContent = 'Foto selecionada. Ela será reduzida antes de ser guardada.';
}

// Seleção pela galeria
inputFoto.accept = 'image/*';
inputFoto.removeAttribute('capture');

inputFoto.addEventListener('change', () => {
  mostrarPreview(inputFoto.files && inputFoto.files[0]);
});

// Campo para abrir a câmera do celular
const inputCamera = document.createElement('input');
inputCamera.type = 'file';
inputCamera.accept = 'image/*';
inputCamera.setAttribute('capture', 'environment');
inputCamera.hidden = true;

const botaoCamera = document.createElement('button');
botaoCamera.type = 'button';
botaoCamera.textContent = 'Tirar foto';
botaoCamera.className = 'btn-camera';

botaoCamera.style.cssText =
  'display:inline-block;margin:8px 0;padding:10px 16px;border:1px solid #9b7955;border-radius:8px;background:#fffaf3;color:#654b35;font:inherit;cursor:pointer;';

botaoCamera.addEventListener('click', () => inputCamera.click());

inputCamera.addEventListener('change', () => {
  mostrarPreview(inputCamera.files && inputCamera.files[0]);
});

const pontoInsercao = inputFoto.closest('label') || inputFoto;

pontoInsercao.insertAdjacentElement('afterend', inputCamera);
inputCamera.insertAdjacentElement('afterend', botaoCamera);

// Remover foto selecionada
removerFoto.addEventListener('click', () => {
  fotoSelecionada = null;
  inputFoto.value = '';
  inputCamera.value = '';
  limparPreview();
  statusEnvio.textContent = '';
});

// Reduzir tamanho da imagem
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

    desenhar = (ctx, w, h) => {
      ctx.drawImage(bitmap, 0, 0, w, h);
    };
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

    desenhar = (ctx, w, h) => {
      ctx.drawImage(imagem, 0, 0, w, h);
    };
  }

  const escala = Math.min(
    1,
    LADO_MAXIMO / Math.max(largura, altura)
  );

  const novaLargura = Math.max(1, Math.round(largura * escala));
  const novaAltura = Math.max(1, Math.round(altura * escala));

  const canvas = document.createElement('canvas');
  canvas.width = novaLargura;
  canvas.height = novaAltura;

  const contexto = canvas.getContext('2d', { alpha: false });

  try {
    desenhar(contexto, novaLargura, novaAltura);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((resultado) => {
        if (resultado) {
          resolve(resultado);
        } else {
          reject(new Error('Não foi possível comprimir a imagem.'));
        }
      }, 'image/jpeg', QUALIDADE_JPEG);
    });

    return blob;
  } finally {
    canvas.width = 1;
    canvas.height = 1;

    if (bitmap && bitmap.close) bitmap.close();

    limparImagem();
  }
}

// Converter imagem para formato que o armazenamento atual aceita
function blobParaDataURL(blob) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();

    leitor.onload = () => resolve(leitor.result);
    leitor.onerror = () => reject(new Error('Não foi possível ler a imagem.'));

    leitor.readAsDataURL(blob);
  });
}

// Modal de foto
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

// Mostrar fotos no mural
function renderizarMural() {
  const fotos = lerFotos();

  mural.innerHTML = '';

  if (!fotos.length) {
    mural.innerHTML = `
      <div class="empty-state">
        <span aria-hidden="true">✿</span>
        <h3>A primeira lembrança pode ser sua!</h3>
        <p>Envie uma foto para começar a montar nosso mural.</p>
      </div>
    `;
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

// Envio da foto
formFoto.addEventListener('submit', async (event) => {
  event.preventDefault();

  const nome = nomeConvidado.value.trim();

  if (!nome || !fotoSelecionada) {
    statusEnvio.textContent =
      'Preencha seu nome e tire ou escolha uma foto.';
    return;
  }

  const botaoEnviar = formFoto.querySelector('[type="submit"]');

  if (botaoEnviar) botaoEnviar.disabled = true;

  statusEnvio.textContent = 'Preparando sua foto...';

  try {
    const imagemComprimida = await comprimirImagem(fotoSelecionada);
    const imagemDataURL = await blobParaDataURL(imagemComprimida);

    const fotos = lerFotos();

    fotos.push({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      nome: nome,
      mensagem: mensagemConvidado.value.trim(),
      imagem: imagemDataURL
    });

    localStorage.setItem(STORAGE_KEY, JSON.stringify(fotos));

    renderizarMural();
    formFoto.reset();

    fotoSelecionada = null;
    limparPreview();

    statusEnvio.textContent =
      'Foto adicionada neste dispositivo. Obrigado por compartilhar! ♥';

    document.getElementById('mural').scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });

  } catch (erro) {
    console.error(erro);

    statusEnvio.textContent =
      'Não foi possível guardar a foto. Tente outra imagem ou escolha uma foto menor.';

  } finally {
    if (botaoEnviar) botaoEnviar.disabled = false;
  }
});

renderizarMural();

