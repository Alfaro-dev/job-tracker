'use strict';

const API_URL = 'https://api.minimax.io/v1/chat/completions';
const MODEL = 'MiniMax-M2.7';
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/**
 * Servicio de IA para el Centralizador de Ofertas de Empleo
 * Utiliza la API de MiniMax M2.7 para todas las operaciones de inteligencia artificial.
 * Cada método implementa reintentos con exponential backoff para mayor confiabilidad.
 */
class AIService {
  /**
   * Constructor del servicio de IA.
   * @param {string} apiKey - Clave de API de MiniMax (opcional, usa MINIMAX_API_KEY del entorno si no se provee).
   */
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.MINIMAX_API_KEY;
    if (!this.apiKey) {
      throw new Error('MINIMAX_API_KEY no está configurada en el entorno');
    }
  }

  /**
   * Realiza una llamada a la API de MiniMax con reintentos automáticos.
   * Implementa exponential backoff: 1s, 2s, 4s entre intentos.
   * @param {string} systemPrompt - Prompt del sistema para definir el comportamiento del modelo.
   * @param {string} userPrompt - Prompt del usuario con la consulta específica.
   * @returns {Promise<string>} Respuesta del modelo en texto.
   * @throws {Error} Si todos los reintentos fallan.
   */
  async _callMinimax(systemPrompt, userPrompt) {
    let lastError;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify({
            model: MODEL,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0.3
          })
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`Error de API (${response.status}): ${errorBody}`);
        }

        const data = await response.json();

        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
          throw new Error('Respuesta inválida de la API de MiniMax');
        }

        return data.choices[0].message.content.trim();
      } catch (error) {
        lastError = error;
        console.warn(`Intento ${attempt}/${MAX_RETRIES} falló: ${error.message}`);

        if (attempt < MAX_RETRIES) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`Todos los intentos fallaron. Último error: ${lastError.message}`);
  }

  /**
   * RF 2.1 - Generación de Resumen Ejecutivo
   * Transforma descripciones largas de empleo en un resumen corto y estructurado.
   * Genera exactamente 3-4 viñetas con un máximo de 100 palabras en total.
   * @param {string} description - Descripción completa del empleo.
   * @returns {Promise<string[]>} Array de viñetas (3-4 máximo).
   */
  async summarizeJob(description) {
    const systemPrompt = `Eres un asistente especializado en analizar ofertas de empleo.
Tu tarea es generar un resumen ejecutivo estructurado en español.
Reglas estrictas:
- Genera EXACTAMENTE 3 o 4 viñetas.
- Cada viñeta debe ser breve y concreta.
- El resumen completo NO DEBE superar las 100 palabras.
- Usa viñetas con guiones (-).
- No uses puntos ni enumeraciones complejas.
- Enfócate en: responsabilidades clave, requisitos principales, qué ofrece la empresa.
- Si detectas información de contacto o instrucciones de postulación, exclúyela del resumen.`;

    const userPrompt = `Analiza la siguiente descripción de empleo y genera un resumen ejecutivo:\n\n${description}`;

    const result = await this._callMinimax(systemPrompt, userPrompt);

    const bullets = result
      .split('\n')
      .filter(line => line.trim().startsWith('-'))
      .map(line => line.trim().substring(2).trim());

    return bullets.length > 0 ? bullets : result.split('\n').filter(l => l.trim());
  }

  /**
   * RF 2.2 - Auditoría de Seniority Real
   * Analiza los requisitos de experiencia y clasifica la oferta en Junior, Mid o Senior.
   * Ignora el título original si contradice los requisitos reales del texto.
   * @param {string} description - Descripción completa del empleo.
   * @returns {Promise<{level: string, confidence: string, reasoning: string}>}
   */
  async auditSeniority(description) {
    const systemPrompt = `Eres un experto en análisis de perfiles laborales y niveles de seniority.
Tu tarea es clasificar ofertas de empleo en tres categorías: Junior, Mid o Senior.
Reglas strictas:
- Analiza SOLO el texto de la descripción, no el título del empleo.
- Busca indicadores de años de experiencia requeridos.
- Evalúa la complejidad de responsabilidades descritas.
- Considera si requiere liderazgo, toma de decisiones autónomas o mentorship.
- Clasifica según la realidad del contenido, no el título decoroso.
- Responde SOLO con un objeto JSON, sin texto adicional.
- Formato: {"level": "Junior|Mid|Senior", "confidence": "alta|media|baja", "reasoning": "explicación breve en español"}`;

    const userPrompt = `Analiza esta descripción de empleo y determina el nivel de seniority real:\n\n${description}`;

    const result = await this._callMinimax(systemPrompt, userPrompt);
    return JSON.parse(result);
  }

  /**
   * RF 2.3 - Ficha Técnica Estructurada
   * Extrae y etiqueta: modalidad (Remoto/Híbrido/Presencial), stack de habilidades y rango salarial.
   * @param {Object} jobData - Datos del empleo { titulo, empresa, descripcion, ubicacion }.
   * @returns {Promise<{modalidad: string, habilidades: string[], rangoSalarial: string|null}>}
   */
  async extractJobTechSpec(jobData) {
    const systemPrompt = `Eres un asistente especializado en extraer información estructurada de ofertas de empleo.
Tu tarea es analizar el texto y extraer datos en tres categorías específicas.
Reglas estrictas:
- Modalidad: clasifica como "Remoto", "Híbrido" o "Presencial". Si no está claro, responde "No especificado".
- Habilidades: extrae una lista limpia de tecnologías, herramientas, lenguajes o habilidades técnicas mencionadas.
- Rango salarial: extrae SOLO si está explícito o claramente implícito en el texto. Si no aparece, usa null.
- Responde SOLO con un objeto JSON válido, sin texto adicional ni explicaciones.
- Formato: {"modalidad": "Remoto|Híbrido|Presencial|No especificado", "habilidades": ["habilidad1", "habilidad2"], "rangoSalarial": "Q00,000 - Q00,000|None"}`;

    const userPrompt = `Extrae la información técnica estructurada de esta oferta de empleo:\n\nTítulo: ${jobData.titulo || 'No especificado'}\nEmpresa: ${jobData.empresa || 'No especificada'}\nUbicación: ${jobData.ubicacion || 'No especificada'}\n\nDescripción:\n${jobData.descripcion || jobData.description}`;

    const result = await this._callMinimax(systemPrompt, userPrompt);
    return JSON.parse(result);
  }

  /**
   * RF 4.2 - Parseo de Perfil por IA
   * Analiza el CV del usuario y extrae: información de contacto, historial laboral y habilidades.
   * @param {string} cvText - Texto completo del CV (extraído de PDF o Word).
   * @returns {Promise<{contacto: Object, historialLaboral: Object[], habilidades: string[]}>}
   */
  async parseCV(cvText) {
    const systemPrompt = `Eres un experto en análisis y parsing de currículums vítae (CVs).
Tu tarea es extraer información estructurada de un CV en texto plano.
Reglas estrictas:
- Contacto: extrae nombre completo, correo electrónico, teléfono y ubicación si están presentes.
- Historial laboral: identifica cada experiencia con puesto, empresa, duración (fechas o período) y responsabilidades principales.
- Habilidades: lista todas las habilidades técnicas, herramientas, idiomas y competencias mencionadas.
- Si falta información en alguna categoría, usa null o array vacío según corresponda.
- Responde SOLO con un objeto JSON válido, sin texto adicional.
- Formato: {"contacto": {"nombre": "string|null", "email": "string|null", "telefono": "string|null", "ubicacion": "string|null"}, "historialLaboral": [{"puesto": "string", "empresa": "string", "duracion": "string", "responsabilidades": ["string"]}], "habilidades": ["string"]}`;

    const userPrompt = `Analiza el siguiente CV y extrae la información estructurada:\n\n${cvText}`;

    const result = await this._callMinimax(systemPrompt, userPrompt);
    return JSON.parse(result);
  }

  /**
   * RF 5.1 - Cálculo de Compatibilidad
   * Compara el perfil del usuario contra los requisitos de una vacante.
   * Calcula un porcentaje de compatibilidad basado en habilidades y experiencia.
   * @param {Object} userProfile - Perfil del usuario { habilidades: [], experiencia: [], seniority: string }.
   * @param {Object} jobRequirements - Requisitos del empleo { habilidades: [], seniority: string, descripcion: string }.
   * @returns {Promise<{porcentaje: number, coincidencias: string[], gaps: string[], recomendacion: string}>}
   */
  async calculateCompatibility(userProfile, jobRequirements) {
    const systemPrompt = `Eres un motor de compatibilidad laboral especializado.
Tu tarea es calcular qué tan compatible es un candidato con una oferta de empleo específica.
Reglas strictas:
- Compara las habilidades del usuario contra las requeridas por el empleo.
- Evalúa si el nivel de seniority del usuario coincide con el requerido.
- Identifica coincidencias exactas y gaps (habilidades que el usuario no tiene pero el empleo pide).
- Calcula un porcentaje de compatibilidad (0-100%).
- Genera una recomendación breve: "Aplicar", "Aplicar con cautela" o "No recomendado".
- Responde SOLO con un objeto JSON válido, sin texto adicional.
- Formato: {"porcentaje": 0-100, "coincidencias": ["habilidad1", "habilidad2"], "gaps": ["habilidad faltante1"], "recomendacion": "Aplicar|Aplicar con cautela|No recomendado"}`;

    const userPrompt = `Calcula la compatibilidad entre el siguiente perfil de candidato y los requisitos del empleo:\n\nPERFIL DEL CANDIDATO:\nHabilidades: ${userProfile.habilidades ? userProfile.habilidades.join(', ') : 'No especificadas'}\nExperiencia: ${userProfile.experiencia || 'No especificada'}\nSeniority: ${userProfile.seniority || 'No especificado'}\n\nREQUISITOS DEL EMPLEO:\nHabilidades requeridas: ${jobRequirements.habilidades ? jobRequirements.habilidades.join(', ') : jobRequirements.skills || 'No especificadas'}\nSeniority requerido: ${jobRequirements.seniority || 'No especificado'}\n\nDescripción del empleo:\n${jobRequirements.descripcion || jobRequirements.description || ''}`;

    const result = await this._callMinimax(systemPrompt, userPrompt);
    return JSON.parse(result);
  }
}

module.exports = AIService;