// Copiado de atv-onboarding (utils/formExport.js): el mismo PDF que se descarga allá.
import {
  formatFormResponseValue,
  getFormDisplaySections,
} from '../data/onboardingFormFields';

const LOGO_URL = '/logowhite.png';

const ATV_COLORS = {
  red: '#e63946',
  dark: '#111827',
  darkSoft: '#1f2937',
  text: '#111827',
  muted: '#6b7280',
  white: '#ffffff',
};

const ROBOTO_FONTS = {
  Roboto: {
    normal: 'Roboto-Regular.ttf',
    bold: 'Roboto-Medium.ttf',
    italics: 'Roboto-Italic.ttf',
    bolditalics: 'Roboto-MediumItalic.ttf',
  },
};

let pdfMakePromise = null;

function slugifyFilename(value) {
  return (
    String(value || 'cliente')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'cliente'
  );
}

function formatSubmittedAt(value) {
  if (!value) return null;
  return new Date(value).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function fetchLogoAsBase64() {
  try {
    const response = await fetch(LOGO_URL);
    if (!response.ok) return null;

    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function buildPdfHeader(logoBase64) {
  const brandStack = logoBase64
    ? [{ image: logoBase64, width: 96, alignment: 'center', margin: [0, 0, 0, 10] }]
    : [{ text: 'ATV', style: 'brandFallback', alignment: 'center', margin: [0, 0, 0, 10] }];

  return {
    table: {
      widths: ['*'],
      body: [
        [
          {
            stack: [
              ...brandStack,
              {
                text: 'FORMULARIO DE ONBOARDING',
                style: 'headerTitle',
                alignment: 'center',
              },
              {
                text: 'AUMENTA TU VALOR',
                style: 'headerSubtitle',
                alignment: 'center',
                margin: [0, 4, 0, 0],
              },
            ],
            fillColor: ATV_COLORS.dark,
            margin: [24, 28, 24, 28],
            border: [false, false, false, false],
          },
        ],
      ],
    },
    layout: 'noBorders',
    margin: [-40, -48, -40, 0],
  };
}

function buildPdfMetadataCard(data) {
  const submittedAt = formatSubmittedAt(data?.submitted_at);
  const rows = [
    ['Cliente', data?.client_name || '—'],
    ['Email', data?.client_email || '—'],
    ['Plan', data?.plan || '—'],
  ];

  if (submittedAt) {
    rows.push(['Enviado', submittedAt]);
  } else if (data?.is_draft) {
    rows.push(['Estado', 'Borrador — pendiente de envío al servidor']);
  }

  return {
    stack: rows.map(([label, value]) => ({
      columns: [
        { text: `${label}:`, width: 72, style: 'metaLabel' },
        {
          text: value,
          style: label === 'Plan' ? 'metaPlan' : 'metaValue',
        },
      ],
      columnGap: 8,
      margin: [0, 0, 0, 6],
    })),
    margin: [0, 20, 0, 16],
    unbreakable: true,
  };
}

function buildPdfSectionTitle(title) {
  return {
    table: {
      widths: ['*'],
      body: [
        [
          {
            text: title,
            style: 'sectionTitle',
            fillColor: ATV_COLORS.red,
            color: ATV_COLORS.white,
            margin: [12, 8, 12, 8],
            border: [false, false, false, false],
          },
        ],
      ],
    },
    layout: 'noBorders',
    margin: [0, 14, 0, 10],
  };
}

function buildPdfQuestionBlock(id, label, answer) {
  return {
    stack: [
      {
        text: `${id}. ${label}`,
        style: 'question',
        margin: [0, 0, 0, 4],
      },
      {
        text: answer,
        style: 'answer',
        margin: [0, 0, 0, 12],
      },
    ],
    unbreakable: true,
  };
}

async function buildFormPdfDefinition(data, { includeLogo = true } = {}) {
  const responses = data?.form_data || {};
  const sections = getFormDisplaySections(responses);
  const logoBase64 = includeLogo ? await fetchLogoAsBase64() : null;

  const content = [
    buildPdfHeader(logoBase64),
    buildPdfMetadataCard(data),
    {
      canvas: [
        {
          type: 'line',
          x1: 0,
          y1: 0,
          x2: 515,
          y2: 0,
          lineWidth: 2,
          lineColor: ATV_COLORS.red,
        },
      ],
      margin: [0, 0, 0, 8],
    },
  ];

  for (const section of sections) {
    const questionBlocks = section.questions.map(({ id, label }) =>
      buildPdfQuestionBlock(id, label, formatFormResponseValue(responses[id])),
    );

    if (section.title && questionBlocks.length > 0) {
      content.push({
        stack: [buildPdfSectionTitle(section.title), questionBlocks[0]],
        unbreakable: true,
      });
      content.push(...questionBlocks.slice(1));
      continue;
    }

    if (section.title) {
      content.push(buildPdfSectionTitle(section.title));
    }

    content.push(...questionBlocks);
  }

  return {
    content,
    styles: {
      brandFallback: {
        fontSize: 28,
        bold: true,
        color: ATV_COLORS.red,
      },
      headerTitle: {
        fontSize: 13,
        bold: true,
        color: ATV_COLORS.white,
        characterSpacing: 1.2,
      },
      headerSubtitle: {
        fontSize: 9,
        color: '#b8bcc4',
        characterSpacing: 2,
      },
      metaLabel: {
        fontSize: 8,
        bold: true,
        color: ATV_COLORS.muted,
      },
      metaValue: {
        fontSize: 9,
        color: ATV_COLORS.text,
      },
      metaPlan: {
        fontSize: 9,
        bold: true,
        color: ATV_COLORS.red,
      },
      sectionTitle: {
        fontSize: 8.5,
        bold: true,
      },
      question: {
        fontSize: 8.5,
        bold: true,
        color: ATV_COLORS.darkSoft,
      },
      answer: {
        fontSize: 9,
        color: ATV_COLORS.text,
        lineHeight: 1.35,
      },
      footer: {
        fontSize: 7.5,
        color: ATV_COLORS.muted,
      },
    },
    defaultStyle: {
      font: 'Roboto',
      fontSize: 9,
    },
    pageMargins: [40, 48, 40, 56],
    footer: (currentPage, pageCount) => ({
      columns: [
        {
          text: 'ATV — Aumenta Tu Valor',
          style: 'footer',
          alignment: 'left',
        },
        {
          text: `Página ${currentPage} de ${pageCount}`,
          style: 'footer',
          alignment: 'right',
        },
      ],
      margin: [40, 16, 40, 0],
    }),
  };
}

async function loadPdfMake() {
  if (pdfMakePromise) {
    return pdfMakePromise;
  }

  pdfMakePromise = (async () => {
    const [pdfMakeModule, vfsModule] = await Promise.all([
      import('pdfmake/build/pdfmake'),
      import('pdfmake/build/vfs_fonts'),
    ]);

    const pdfMake = pdfMakeModule.default ?? pdfMakeModule;
    const vfs = vfsModule.default ?? vfsModule;

    if (!pdfMake?.createPdf) {
      throw new Error('No se pudo inicializar el generador de PDF.');
    }
    if (!vfs || typeof vfs !== 'object' || !vfs['Roboto-Regular.ttf']) {
      throw new Error('No se pudieron cargar las fuentes del PDF.');
    }

    if (typeof pdfMake.addVirtualFileSystem === 'function') {
      pdfMake.addVirtualFileSystem(vfs);
    } else {
      pdfMake.vfs = vfs;
    }

    if (typeof pdfMake.addFonts === 'function') {
      pdfMake.addFonts(ROBOTO_FONTS);
    }

    return pdfMake;
  })();

  return pdfMakePromise;
}

function triggerBrowserDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function createPdfBlob(docDefinition) {
  const pdfMake = await loadPdfMake();
  return pdfMake.createPdf(docDefinition).getBlob();
}

export async function createFormPdfBlob(data) {
  try {
    const docDefinition = await buildFormPdfDefinition(data, { includeLogo: true });
    return await createPdfBlob(docDefinition);
  } catch (error) {
    console.error('Error al generar PDF con logo:', error);
  }

  try {
    const docDefinition = await buildFormPdfDefinition(data, { includeLogo: false });
    return await createPdfBlob(docDefinition);
  } catch (error) {
    console.error('Error al generar PDF:', error);
    throw new Error('No se pudo generar el PDF.');
  }
}

export async function downloadFormFile(data) {
  const filename = `formulario-${slugifyFilename(data?.client_name)}.pdf`;
  const blob = await createFormPdfBlob(data);
  triggerBrowserDownload(blob, filename);
}

/** Exporta respuestas del borrador local (cliente aún no envió al servidor). */
export async function downloadDraftFormFile({ clientName, clientEmail, plan, formData }) {
  return downloadFormFile({
    client_name: clientName || 'Cliente ATV',
    client_email: clientEmail || null,
    plan: plan || null,
    form_data: formData,
    is_draft: true,
  });
}

function uniquePdfFilename(clientName, usedNames) {
  const base = `formulario-${slugifyFilename(clientName)}.pdf`;
  if (!usedNames.has(base)) {
    usedNames.add(base);
    return base;
  }

  let index = 2;
  let candidate = `formulario-${slugifyFilename(clientName)}-${index}.pdf`;
  while (usedNames.has(candidate)) {
    index += 1;
    candidate = `formulario-${slugifyFilename(clientName)}-${index}.pdf`;
  }
  usedNames.add(candidate);
  return candidate;
}

/**
 * Descarga un ZIP con un PDF por formulario.
 * @param {Array<object>} formsData lista en el mismo formato que downloadFormFile
 * @param {{ filename?: string, onProgress?: (done: number, total: number) => void }} [options]
 */
export async function downloadAllFormFilesAsZip(formsData, options = {}) {
  const forms = Array.isArray(formsData) ? formsData.filter(Boolean) : [];
  if (forms.length === 0) {
    throw new Error('No hay formularios completados para descargar.');
  }

  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const usedNames = new Set();
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

  for (let index = 0; index < forms.length; index += 1) {
    const data = forms[index];
    const blob = await createFormPdfBlob(data);
    const filename = uniquePdfFilename(data?.client_name, usedNames);
    zip.file(filename, blob);
    onProgress?.(index + 1, forms.length);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const zipName =
    options.filename ||
    `onboarding-formularios-${new Date().toISOString().slice(0, 10)}.zip`;
  triggerBrowserDownload(zipBlob, zipName);

  return { count: forms.length, filename: zipName };
}
