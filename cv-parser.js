/**
 * cv-parser.js
 * Módulo para extracción de texto de CVs (PDF/DOCX) y generación de CV formato Harvard.
 * 
 * Dependencias: pdf-parse, mammoth
 */

const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

/**
 * Extrae texto de un archivo PDF desde un buffer.
 * @param {Buffer} buffer - Contenido binario del PDF
 * @returns {Promise<string>} Texto extraído del PDF
 */
async function extractTextFromPDF(buffer) {
  const data = await pdfParse(buffer);
  return data.text;
}

/**
 * Extrae texto de un archivo DOCX desde un buffer.
 * @param {Buffer} buffer - Contenido binario del DOCX
 * @returns {Promise<string>} Texto extraído del DOCX
 */
async function extractTextFromDOCX(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

/**
 * Unifica la extracción de texto según el tipo MIME del archivo.
 * @param {Buffer} fileBuffer - Contenido binario del archivo
 * @param {string} mimeType - Tipo MIME del archivo (application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document)
 * @returns {Promise<string>} Texto extraído del CV
 */
async function extractText(fileBuffer, mimeType) {
  if (mimeType === 'application/pdf') {
    return extractTextFromPDF(fileBuffer);
  } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return extractTextFromDOCX(fileBuffer);
  } else {
    throw new Error(`Tipo MIME no soportado: ${mimeType}`);
  }
}

/**
 * Genera un CV en formato HTML basado en la plantilla Harvard.
 * Diseño: una columna, sin fotografías/iconos/barras de habilidades.
 * Tipografía: Arial/Helvetica 11pt, márgenes 2.5cm.
 * Secciones: Contacto, Resumen, Experiencia, Educación, Habilidades.
 * @param {Object} profile - Perfil estructurado del usuario
 * @param {Object} profile.contacto - Información de contacto {nombre, email, telefono, ubicacion, linkedin}
 * @param {Object} profile.resumen - Resumen profesional {texto}
 * @param {Array} profile.experiencia - Historial laboral [{puesto, empresa, duracion, descripcion}]
 * @param {Array} profile.educacion - Historial educativo [{titulo, institucion, anio}]
 * @param {Array} profile.habilidades - Lista de habilidades técnicas [{nombre, nivel}]
 * @returns {string} HTML formateado del CV Harvard
 */
function generateHarvardHTML(profile) {
  const contacto = profile.contacto || {};
  const resumen = profile.resumen || {};
  const experiencia = profile.experiencia || [];
  const educacion = profile.educacion || [];
  const habilidades = profile.habilidades || [];

  const seccionContacto = `
    <div class="seccion">
      <h1 class="nombre">${contacto.nombre || 'Nombre del Candidato'}</h1>
      <div class="contacto">
        ${contacto.email ? `<span>${contacto.email}</span>` : ''}
        ${contacto.telefono ? `<span>${contacto.telefono}</span>` : ''}
        ${contacto.ubicacion ? `<span>${contacto.ubicacion}</span>` : ''}
        ${contacto.linkedin ? `<span>${contacto.linkedin}</span>` : ''}
      </div>
    </div>
  `;

  const seccionResumen = resumen.texto ? `
    <div class="seccion">
      <h2 class="titulo-seccion">Resumen Profesional</h2>
      <p class="resumen">${resumen.texto}</p>
    </div>
  ` : '';

  const seccionExperiencia = experiencia.length > 0 ? `
    <div class="seccion">
      <h2 class="titulo-seccion">Experiencia Profesional</h2>
      ${experiencia.map(exp => `
        <div class="item">
          <div class="item-header">
            <span class="puesto">${exp.puesto || ''}</span>
            <span class="duracion">${exp.duracion || ''}</span>
          </div>
          <div class="empresa">${exp.empresa || ''}</div>
          ${exp.descripcion ? `<p class="descripcion">${exp.descripcion}</p>` : ''}
        </div>
      `).join('')}
    </div>
  ` : '';

  const seccionEducacion = educacion.length > 0 ? `
    <div class="seccion">
      <h2 class="titulo-seccion">Educación</h2>
      ${educacion.map(edu => `
        <div class="item">
          <div class="item-header">
            <span class="titulo-edu">${edu.titulo || ''}</span>
            <span class="anio">${edu.anio || ''}</span>
          </div>
          <div class="institucion">${edu.institucion || ''}</div>
        </div>
      `).join('')}
    </div>
  ` : '';

  const seccionHabilidades = habilidades.length > 0 ? `
    <div class="seccion">
      <h2 class="titulo-seccion">Habilidades</h2>
      <div class="habilidades-lista">
        ${habilidades.map(h => `<span class="habilidad">${h.nombre || h}</span>`).join(', ')}
      </div>
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CV - ${contacto.nombre || 'Candidato'}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11pt;
      line-height: 1.4;
      color: #000;
      background: #fff;
      padding: 2.5cm;
      max-width: 21cm;
    }

    .seccion {
      margin-bottom: 1.2em;
    }

    .nombre {
      font-size: 18pt;
      font-weight: bold;
      margin-bottom: 0.3em;
    }

    .contacto {
      font-size: 10pt;
      margin-bottom: 0.5em;
    }

    .contacto span {
      display: inline;
    }

    .contacto span:not(:last-child)::after {
      content: " • ";
    }

    .titulo-seccion {
      font-size: 12pt;
      font-weight: bold;
      text-transform: uppercase;
      border-bottom: 1px solid #000;
      padding-bottom: 0.2em;
      margin-bottom: 0.6em;
    }

    .resumen {
      text-align: justify;
    }

    .item {
      margin-bottom: 0.8em;
    }

    .item-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }

    .puesto, .titulo-edu {
      font-weight: bold;
      font-size: 11pt;
    }

    .duracion, .anio {
      font-style: italic;
      font-size: 10pt;
    }

    .empresa, .institucion {
      font-size: 10pt;
      margin-top: 0.1em;
    }

    .descripcion {
      margin-top: 0.3em;
      text-align: justify;
    }

    .habilidades-lista {
      line-height: 1.6;
    }

    .habilidad {
      display: inline;
    }

    .habilidad:not(:last-child)::after {
      content: ", ";
    }

    @media print {
      body {
        padding: 0;
      }
    }
  </style>
</head>
<body>
${seccionContacto}
${seccionResumen}
${seccionExperiencia}
${seccionEducacion}
${seccionHabilidades}
</body>
</html>`;
}

module.exports = {
  extractTextFromPDF,
  extractTextFromDOCX,
  extractText,
  generateHarvardHTML
};